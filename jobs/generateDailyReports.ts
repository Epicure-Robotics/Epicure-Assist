import { KnownBlock } from "@slack/web-api";
import { subDays, subHours } from "date-fns";
import { aliasedTable, and, count, desc, eq, gte, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { conversationMessages, conversations, DRAFT_STATUSES, mailboxes } from "@/db/schema";
import { triggerEvent } from "@/jobs/trigger";
import { getMailbox } from "@/lib/data/mailbox";
import { getMemberStats } from "@/lib/data/stats";
import { getSlackUsersByEmail, postSlackMessage } from "@/lib/slack/client";

export const TIME_ZONE = "Asia/Kolkata";

export async function generateDailyReports() {
  const mailboxesList = await db.query.mailboxes.findMany({
    columns: { id: true },
    where: and(isNotNull(mailboxes.slackBotToken), isNotNull(mailboxes.slackAlertChannel)),
  });

  if (!mailboxesList.length) return;

  await triggerEvent("reports/daily", {});
}

type DailyReportOptions = {
  dryRun?: boolean;
};

const formatPercentChange = (current: number, baseline: number): string => {
  if (baseline === 0) return current === 0 ? "0%" : "n/a";

  const delta = Math.round(((current - baseline) / baseline) * 100);
  return `${delta >= 0 ? "+" : ""}${delta}%`;
};

const formatDurationFromSeconds = (seconds: number | null): string => {
  if (seconds === null || Number.isNaN(seconds)) return "n/a";

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
};

const getPercentile = (values: number[], percentile: number): number | null => {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower] ?? null;

  const lowerValue = sorted[lower];
  const upperValue = sorted[upper];
  if (lowerValue === undefined || upperValue === undefined) return null;

  return lowerValue + (upperValue - lowerValue) * (index - lower);
};

export async function generateMailboxDailyReport({ dryRun = false }: DailyReportOptions = {}) {
  const mailbox = await getMailbox();
  if (!mailbox?.slackBotToken || !mailbox.slackAlertChannel) return;

  // Legacy data can be stored with mailbox_id = 0 even when mailbox.id is non-zero.
  // Prefer explicit mailbox.id when it has rows, otherwise fall back to 0 so metrics stay consistent.
  const [mailboxConversationCount] = await db
    .select({ value: count() })
    .from(conversations)
    .where(eq(conversations.unused_mailboxId, mailbox.id));
  const effectiveMailboxId = (mailboxConversationCount?.value ?? 0) > 0 ? mailbox.id : 0;

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "plain_text",
        text: `Daily summary for ${mailbox.name}:`,
        emoji: true,
      },
    },
  ];

  const endTime = new Date();
  const startTime = subHours(endTime, 24);
  const previousStartTime = subHours(startTime, 24);
  const sevenDaysStartTime = subDays(startTime, 7);

  const [newInLast24hResult] = await db
    .select({ value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.unused_mailboxId, effectiveMailboxId),
        isNull(conversations.mergedIntoId),
        gte(conversations.createdAt, startTime),
        lt(conversations.createdAt, endTime),
      ),
    );

  const [newInPrevious24hResult] = await db
    .select({ value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.unused_mailboxId, effectiveMailboxId),
        isNull(conversations.mergedIntoId),
        gte(conversations.createdAt, previousStartTime),
        lt(conversations.createdAt, startTime),
      ),
    );

  const [newInPrevious7DaysResult] = await db
    .select({ value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.unused_mailboxId, effectiveMailboxId),
        isNull(conversations.mergedIntoId),
        gte(conversations.createdAt, sevenDaysStartTime),
        lt(conversations.createdAt, startTime),
      ),
    );

  const memberStats = await getMemberStats({
    startDate: startTime,
    endDate: endTime,
  });

  const userMessages = aliasedTable(conversationMessages, "userMessages");
  const responseRows = await db
    .select({
      conversationId: conversationMessages.conversationId,
      staffReplyAt: conversationMessages.createdAt,
      responseSeconds:
        sql<number>`EXTRACT(EPOCH FROM (${conversationMessages.createdAt} - ${userMessages.createdAt}))`.mapWith(
          Number,
        ),
    })
    .from(conversationMessages)
    .innerJoin(userMessages, eq(conversationMessages.responseToId, userMessages.id))
    .innerJoin(conversations, eq(conversationMessages.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.unused_mailboxId, effectiveMailboxId),
        isNull(conversations.mergedIntoId),
        eq(conversationMessages.role, "staff"),
        eq(userMessages.role, "user"),
        isNull(conversationMessages.deletedAt),
        notInArray(conversationMessages.status, DRAFT_STATUSES),
        gte(conversationMessages.createdAt, startTime),
        lt(conversationMessages.createdAt, endTime),
      ),
    )
    .orderBy(conversationMessages.conversationId, conversationMessages.createdAt);

  const firstResponseByConversation = new Map<number, number>();
  for (const row of responseRows) {
    if (!firstResponseByConversation.has(row.conversationId)) {
      firstResponseByConversation.set(row.conversationId, row.responseSeconds);
    }
  }

  const firstResponseSeconds = [...firstResponseByConversation.values()];
  const firstResponseP50 = getPercentile(firstResponseSeconds, 0.5);
  const firstResponseP75 = getPercentile(firstResponseSeconds, 0.75);
  const firstResponseP90 = getPercentile(firstResponseSeconds, 0.9);

  const openCounts = await db
    .select({
      assignedToId: conversations.assignedToId,
      openCount: count(),
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.unused_mailboxId, effectiveMailboxId),
        isNull(conversations.mergedIntoId),
        eq(conversations.status, "open"),
        isNotNull(conversations.assignedToId),
      ),
    )
    .groupBy(conversations.assignedToId)
    .orderBy(desc(count()));

  const openCountByAssignee = new Map<string, number>();
  for (const row of openCounts) {
    if (row.assignedToId) {
      openCountByAssignee.set(row.assignedToId, row.openCount);
    }
  }

  const slackUsersByEmail = await getSlackUsersByEmail(mailbox.slackBotToken);

  blocks.push({ type: "divider" });

  const newInLast24h = newInLast24hResult?.value ?? 0;
  const newInPrevious24h = newInPrevious24hResult?.value ?? 0;
  const previous7DaysAverage = (newInPrevious7DaysResult?.value ?? 0) / 7;

  const demandLine = `• New: ${newInLast24h.toLocaleString()} (vs yday ${formatPercentChange(
    newInLast24h,
    newInPrevious24h,
  )}, vs 7d ${formatPercentChange(newInLast24h, previous7DaysAverage)})`;

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: demandLine,
    },
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `• First response p50/p75/p90: ${formatDurationFromSeconds(firstResponseP50)} / ${formatDurationFromSeconds(firstResponseP75)} / ${formatDurationFromSeconds(firstResponseP90)}`,
    },
  });

  blocks.push({ type: "divider" });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: "*By Staff (last 24h)*",
    },
  });

  const staffRows = memberStats
    .map((member) => ({
      ...member,
      openCount: openCountByAssignee.get(member.id) ?? 0,
    }))
    .filter((member) => member.replyCount > 0 || member.openCount > 0)
    .sort((a, b) => b.replyCount - a.replyCount || b.openCount - a.openCount);

  const memberLines = staffRows.map((member) => {
    const formattedCount = member.replyCount.toLocaleString();
    const formattedOpenCount = member.openCount.toLocaleString();
    const slackUserId = slackUsersByEmail.get(member.email!);
    const userName = slackUserId ? `<@${slackUserId}>` : member.displayName || member.email || "Unknown";

    return `• ${userName}: Replies ${formattedCount} | Open ${formattedOpenCount}`;
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: memberLines.length > 0 ? memberLines.join("\n") : "• No staff activity in the last 24h",
    },
  });

  if (!dryRun) {
    await postSlackMessage(mailbox.slackBotToken, {
      channel: mailbox.slackAlertChannel,
      text: `Daily summary for ${mailbox.name}`,
      blocks,
    });
  }

  return {
    success: true,
    dryRun,
    channel: mailbox.slackAlertChannel,
    text: `Daily summary for ${mailbox.name}`,
    blocks,
    metrics: {
      newConversations: newInLast24h,
      newConversationsPreviousDay: newInPrevious24h,
      newConversationsSevenDayAverage: previous7DaysAverage,
      firstResponseP50Seconds: firstResponseP50,
      firstResponseP75Seconds: firstResponseP75,
      firstResponseP90Seconds: firstResponseP90,
      firstResponseSampleSize: firstResponseSeconds.length,
      effectiveMailboxId,
    },
    memberStats: staffRows.map((member) => ({
      email: member.email,
      replyCount: member.replyCount,
      openCount: member.openCount,
    })),
  };
}
