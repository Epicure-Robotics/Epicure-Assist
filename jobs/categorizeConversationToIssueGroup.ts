import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { conversationMessages } from "@/db/schema/conversationMessages";
import { conversations } from "@/db/schema/conversations";
import { issueGroups } from "@/db/schema/issueGroups";
import { runAIObjectQuery } from "@/lib/ai";
import { DRAFT_MODEL } from "@/lib/ai/core";
import { getMailbox } from "@/lib/data/mailbox";
import {
  assignedToAiFromTriage,
  inboundTriageAISchema,
  inboundTriageFromAi,
  STARTER_INBOUND_CATEGORY_LABELS,
  starterInboundCategoryKeys,
} from "@/lib/leads/inboundTriage";
import { triggerEvent } from "./trigger";
import { assertDefinedOrRaiseNonRetriableError } from "./utils";

const getConversationContent = (conversationData: {
  messages?: {
    role: string;
    cleanedUpText?: string | null;
  }[];
  subject?: string | null;
}): string => {
  if (!conversationData?.messages || conversationData.messages.length === 0) {
    return conversationData.subject || "";
  }

  const userMessages = conversationData.messages
    .filter((msg) => msg.role === "user")
    .map((msg) => {
      if (!msg.cleanedUpText) return "";
      return msg.cleanedUpText;
    })
    .filter(Boolean);

  const contentParts = [];
  if (conversationData.subject) {
    contentParts.push(conversationData.subject);
  }
  contentParts.push(...userMessages);

  return contentParts.join(" ");
};

const triageWithAi = async (
  conversationContent: string,
  availableIssueGroups: { id: number; title: string; description: string | null }[],
  mailbox: NonNullable<Awaited<ReturnType<typeof getMailbox>>>,
) => {
  const starterSection = starterInboundCategoryKeys
    .map((k) => `- **${k}**: ${STARTER_INBOUND_CATEGORY_LABELS[k]}`)
    .join("\n");

  const groupsSection =
    availableIssueGroups.length === 0
      ? "No saved issue groups for this mailbox. Set matchedIssueGroupId to null."
      : `OPTIONAL issue groups (use matchedIssueGroupId only with high confidence):\n${availableIssueGroups
          .map((g) => `ID ${g.id}: ${g.title}${g.description ? ` — ${g.description}` : ""}`)
          .join("\n")}`;

  const result = await runAIObjectQuery({
    mailbox,
    model: DRAFT_MODEL,
    functionId: "inbound-triage-and-issue-group",
    queryType: "auto_assign_conversation",
    schema: inboundTriageAISchema,
    system: `You triage inbound messages for Epicure Robotics (industrial automation, food-line equipment, B2B).

STARTER categories — pick the closest starter when it reasonably fits:
${starterSection}

If none of the starters fit well, use categorySource "proposed": provide a new snake_case key, a short human label, and confidence (0-1).

Always output:
- importance: "low" | "med" | "high" using company/org size signals, specificity (e.g. named site, volumes, budget), urgency, and buying intent. Business leads from large or strategic accounts skew "high".
- geography: country/region string or null if unknown.
- summaryLine: one line (under ~200 characters).
- reasoning: short internal rationale.

Optional matchedIssueGroupId: only from the provided ID list when the thread clearly belongs in that group; otherwise null. Do not invent IDs.

Routing intent (for your reasoning; do not output separate fields):
- Business + high importance → priority human / founder-sales path; not for generic auto-reply.
- Business + low/med → suitable for templated or AI-first reply.
- Vendor pitch → procurement / technical evaluation.
- Hiring → HR.
- Press, partnership, investor-style → founders / leadership.
- Generic / spam → low-touch or core round-robin.`,
    messages: [
      {
        role: "user",
        content: `MESSAGE / THREAD (subject + body):\n${conversationContent.slice(0, 24_000)}\n\n${groupsSection}`,
      },
    ],
    temperature: 0.1,
  });

  return result;
};

export const categorizeConversationToIssueGroup = async ({ messageId }: { messageId: number }) => {
  const message = await db.query.conversationMessages.findFirst({
    where: eq(conversationMessages.id, messageId),
    columns: {
      conversationId: true,
    },
  });

  if (!message) {
    throw new Error(`Message with id ${messageId} not found`);
  }

  const conversation = assertDefinedOrRaiseNonRetriableError(
    await db.query.conversations.findFirst({
      where: eq(conversations.id, message.conversationId),
      columns: {
        id: true,
        subject: true,
        issueGroupId: true,
        inboundTriage: true,
      },
      with: {
        messages: {
          columns: {
            role: true,
            cleanedUpText: true,
          },
        },
      },
    }),
  );

  if (conversation.inboundTriage) {
    return {
      message: "Conversation already triaged",
      conversationId: conversation.id,
    };
  }

  if (conversation.issueGroupId) {
    return {
      message: "Conversation already assigned to an issue group",
      conversationId: conversation.id,
      currentIssueGroupId: conversation.issueGroupId,
    };
  }

  const mailbox = assertDefinedOrRaiseNonRetriableError(await getMailbox());

  const availableIssueGroups = await db
    .select({
      id: issueGroups.id,
      title: issueGroups.title,
      description: issueGroups.description,
    })
    .from(issueGroups);

  const conversationContent = getConversationContent(conversation);

  if (!conversationContent.trim()) {
    return {
      message: "Skipped: conversation has no content to analyze",
      conversationId: conversation.id,
    };
  }

  const aiRaw = await triageWithAi(conversationContent, availableIssueGroups, mailbox);
  const triage = inboundTriageFromAi(aiRaw);

  const allowedIds = new Set(availableIssueGroups.map((g) => g.id));
  const resolvedGroupId =
    triage.matchedIssueGroupId != null && allowedIds.has(triage.matchedIssueGroupId)
      ? triage.matchedIssueGroupId
      : null;

  const assignedToAI = assignedToAiFromTriage(triage);

  await db
    .update(conversations)
    .set({
      inboundTriage: {
        ...triage,
        matchedIssueGroupId: resolvedGroupId,
      },
      issueGroupId: resolvedGroupId,
      assignedToAI,
    })
    .where(eq(conversations.id, conversation.id));

  const matchedTitle = resolvedGroupId ? availableIssueGroups.find((g) => g.id === resolvedGroupId)?.title : undefined;

  const conversationBeforeAssign = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversation.id),
    columns: { assignedToId: true },
  });

  if (!conversationBeforeAssign?.assignedToId) {
    await triggerEvent("conversations/issue-group.assigned", {
      conversationId: conversation.id,
      messageId,
    });
  }

  return {
    message: resolvedGroupId
      ? `Triage complete; matched issue group: ${matchedTitle ?? resolvedGroupId}`
      : "Triage complete (no issue group match)",
    conversationId: conversation.id,
    assignedIssueGroupId: resolvedGroupId,
    issueGroupTitle: matchedTitle,
    triageSummary: triage.summaryLine,
    assignedToAI,
  };
};
