import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { conversationMessages, conversations } from "@/db/schema";
import { serializeConversation } from "@/lib/data/conversation";
import { getMessages } from "@/lib/data/conversationMessage";
import { findTicketMatches } from "@/lib/emailSearchService/searchEmailsByKeywords";
import {
  CONVERSATION_STATUSES,
  getArgString,
  parseArgs,
  parseConversationStatus,
  parseCSV,
  parseLimit,
  requireActiveMailbox,
  resolveUser,
} from "./_helpers";

const usage = `
Usage:
  pnpm with-dev-env tsx pocket-helper-skills/scripts/search-similar-tickets.ts \\
    --query "<search text>" [--status <comma-separated>] [--user-id <uuid> | --user-email <email>] \\
    [--exclude-ticket <id>] [--limit <n>]
`;

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

  const mailbox = await requireActiveMailbox();
  const limit = parseLimit(args, "limit", 10, 100);

  const statuses = parseCSV(getArgString(args, "status"))
    .map((status) => parseConversationStatus(status))
    .filter((status): status is (typeof CONVERSATION_STATUSES)[number] => status !== null);

  const assignee = await resolveUser(args, { userIdArg: "user-id", userEmailArg: "user-email" });
  const excludeTicket = getArgString(args, "exclude-ticket");
  const excludeTicketId = excludeTicket ? Number.parseInt(excludeTicket, 10) : null;
  if (excludeTicketId !== null && (!Number.isInteger(excludeTicketId) || excludeTicketId <= 0)) {
    throw new Error(`Invalid --exclude-ticket: ${excludeTicket}`);
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
    limit: Math.max(limit * 5, limit),
    messageOrderBy: [desc(conversationMessages.id)],
  });

  const groupedMatches = new Map<
    number,
    {
      totalScore: number;
      topMatch: (typeof searchResult.matches)[number];
      matches: (typeof searchResult.matches)[number][];
    }
  >();

  for (const match of searchResult.matches) {
    const existing = groupedMatches.get(match.conversationId);
    if (!existing) {
      groupedMatches.set(match.conversationId, {
        totalScore: match.score,
        topMatch: match,
        matches: [match],
      });
      continue;
    }

    existing.totalScore += match.score;
    existing.matches.push(match);
    if (existing.topMatch.score < match.score) {
      existing.topMatch = match;
    }
  }

  const uniqueConversationIds = Array.from(groupedMatches.entries())
    .sort((left, right) => right[1].totalScore - left[1].totalScore)
    .map(([conversationId]) => conversationId)
    .slice(0, limit);

  if (!uniqueConversationIds.length) {
    console.log(JSON.stringify({ query, parsedQuery: searchResult.parsedQuery, matches: [], count: 0 }, null, 2));
    return;
  }

  const matchingConversations = await db.query.conversations.findMany({
    where: and(inArray(conversations.id, uniqueConversationIds), isNull(conversations.mergedIntoId)),
    orderBy: [desc(conversations.updatedAt)],
    with: {
      platformCustomer: true,
    },
  });

  const conversationsById = new Map(matchingConversations.map((conversation) => [conversation.id, conversation]));

  const enriched = await Promise.all(
    uniqueConversationIds
      .map((id) => conversationsById.get(id))
      .filter((conversation): conversation is NonNullable<(typeof matchingConversations)[number]> =>
        Boolean(conversation),
      )
      .map(async (conversation) => {
        const grouped = groupedMatches.get(conversation.id) ?? null;
        const timeline = await getMessages(conversation.id, mailbox);
        return {
          conversation: {
            ...serializeConversation(mailbox, conversation, conversation.platformCustomer ?? null),
          },
          score: grouped?.totalScore ?? 0,
          match: grouped
            ? {
                conversationId: grouped.topMatch.conversationId,
                source: grouped.topMatch.source,
                field: grouped.topMatch.matchedField,
                itemId: grouped.topMatch.itemId,
                matchedText: grouped.topMatch.matchedText,
                snippet: grouped.topMatch.snippet,
                exact: grouped.topMatch.exact,
                score: grouped.topMatch.score,
              }
            : null,
          matches: grouped
            ? grouped.matches.slice(0, 5).map((candidate) => ({
                source: candidate.source,
                field: candidate.matchedField,
                itemId: candidate.itemId,
                matchedText: candidate.matchedText,
                snippet: candidate.snippet,
                exact: candidate.exact,
                score: candidate.score,
              }))
            : [],
          timeline,
        };
      }),
  );

  console.log(
    JSON.stringify(
      {
        query,
        parsedQuery: searchResult.parsedQuery,
        count: enriched.length,
        tickets: enriched,
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
    console.error("Failed to run search-similar-tickets script");
  }
  process.exit(1);
}
