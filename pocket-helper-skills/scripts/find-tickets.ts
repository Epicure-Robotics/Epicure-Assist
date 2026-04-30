import { eq, inArray, isNull, ne } from "drizzle-orm";
import { conversations } from "@/db/schema";
import { getMessages } from "@/lib/data/conversationMessage";
import { findTicketMatches } from "@/lib/emailSearchService/searchEmailsByKeywords";
import {
  CONVERSATION_STATUSES,
  getArgString,
  normalizeStatusList,
  parseArgs,
  parseIntArg,
  parseLimit,
  requireActiveMailbox,
  resolveUser,
} from "./_helpers";

const usage = `
Usage:
  pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/find-tickets.ts \\
    --query "<search text>" [--status <comma-separated>] [--user-id <uuid> | --user-email <email>] \\
    [--exclude-ticket <id>] [--limit <n>] [--context <n>]
`;

const extractTimelineText = (item: Record<string, unknown>) => {
  const value =
    (typeof item.bodyText === "string" && item.bodyText) ||
    (typeof item.body === "string" && item.body) ||
    (typeof item.reason === "string" && item.reason) ||
    (typeof item.eventType === "string" && item.eventType) ||
    (typeof item.type === "string" && item.type) ||
    null;
  if (!value) return null;
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const serializeTimelineItem = (item: Record<string, unknown>) => ({
  id: typeof item.id === "number" ? item.id : null,
  type: typeof item.type === "string" ? item.type : null,
  role: typeof item.role === "string" ? item.role : null,
  createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
  text: extractTimelineText(item),
});

const getContextForMatch = async ({
  conversationId,
  source,
  itemId,
  context,
}: {
  conversationId: number;
  source: string;
  itemId: number | null;
  context: number;
}) => {
  if (!itemId || context <= 0 || !["message", "note", "event"].includes(source)) {
    return [];
  }

  const mailbox = await requireActiveMailbox();
  const timeline = await getMessages(conversationId, mailbox);
  const timelineIndex = timeline.findIndex((candidate) => candidate.type === source && candidate.id === itemId);
  if (timelineIndex < 0) return [];

  return timeline
    .slice(Math.max(0, timelineIndex - context), Math.min(timeline.length, timelineIndex + context + 1))
    .map((item) => serializeTimelineItem(item as Record<string, unknown>));
};

const run = async () => {
  const args = parseArgs();
  if (args.has("help") || args.has("h")) {
    console.log(usage.trim());
    return;
  }

  const query = getArgString(args, "query");
  if (!query) {
    throw new Error("Missing --query");
  }

  const limit = parseLimit(args, "limit", 20, 100);
  const context = parseIntArg(args, "context", 0);
  if (context < 0 || context > 5) {
    throw new Error("--context must be between 0 and 5");
  }

  const statuses = normalizeStatusList(args);
  const assignee = await resolveUser(args, { userIdArg: "user-id", userEmailArg: "user-email" });
  const excludeTicketRaw = getArgString(args, "exclude-ticket");
  const excludeTicketId = excludeTicketRaw ? Number.parseInt(excludeTicketRaw, 10) : null;
  if (excludeTicketRaw && (!Number.isInteger(excludeTicketId) || !excludeTicketId || excludeTicketId <= 0)) {
    throw new Error(`Invalid --exclude-ticket: ${excludeTicketRaw}`);
  }

  const filters = [
    isNull(conversations.mergedIntoId),
    ...(statuses.length ? [inArray(conversations.status, statuses)] : []),
    ...(assignee?.id ? [eq(conversations.assignedToId, assignee.id)] : []),
    ...(excludeTicketId ? [ne(conversations.id, excludeTicketId)] : []),
  ];

  const searchResult = await findTicketMatches({
    query,
    filters,
    limit,
  });

  const contextCache = new Map<string, Awaited<ReturnType<typeof getContextForMatch>>>();
  const matches = [];

  for (const match of searchResult.matches.slice(0, limit)) {
    const contextKey = `${match.conversationId}:${match.source}:${match.itemId ?? "conversation"}`;
    let timelineContext = contextCache.get(contextKey);
    if (!timelineContext) {
      timelineContext = await getContextForMatch({
        conversationId: match.conversationId,
        source: match.source,
        itemId: match.itemId,
        context,
      });
      contextCache.set(contextKey, timelineContext);
    }

    matches.push({
      conversation: {
        id: match.conversationId,
        slug: match.conversationSlug,
        status: match.conversationStatus,
        subject: match.conversationSubject,
        customer: match.customerEmail,
        customerName: match.customerName,
        assignedToId: match.assignedToId,
        updatedAt: match.updatedAt,
        issueGroupId: match.issueGroupId,
        issueGroupTitle: match.issueGroupTitle,
      },
      match: {
        source: match.source,
        field: match.matchedField,
        itemId: match.itemId,
        role: match.role,
        createdAt: match.createdAt,
        matchedText: match.matchedText,
        snippet: match.snippet,
        score: match.score,
        exact: match.exact,
        metadata: match.metadata,
      },
      context: timelineContext,
    });
  }

  console.log(
    JSON.stringify(
      {
        query,
        parsedQuery: searchResult.parsedQuery,
        supportedStatuses: CONVERSATION_STATUSES,
        count: matches.length,
        matches,
      },
      null,
      2,
    ),
  );
};

try {
  await run();
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Failed to run find-tickets script");
  }
  process.exit(1);
}
