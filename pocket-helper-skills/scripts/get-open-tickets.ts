import { searchConversations } from "@/lib/data/conversation/search";
import {
  CONVERSATION_STATUSES,
  DEFAULT_OPEN_TICKET_STATUSES,
  getArgString,
  parseArgs,
  parseConversationStatus,
  parseLimit,
  requireActiveMailbox,
  resolveRequiredUser,
} from "./_helpers";

const usage = `
Usage:
  pnpm with-dev-env tsx pocket-helper-skills/scripts/get-open-tickets.ts \\
    --user-id <uuid>|--user-email <email> \\
    [--status <comma-separated status list>] [--latest] [--limit <n>]

Examples:
  # Get all open tickets for a teammate
  --user-id user_123

  # Get the latest open ticket for a teammate
  --user-email teammate@company.com --latest

  # Include other queue states explicitly
  --user-id user_123 --status open,waiting_on_customer,check_back_later
`;

const run = async () => {
  const args = parseArgs();
  if (args.has("help") || args.has("h")) {
    console.log(usage.trim());
    return;
  }

  const actor = await resolveRequiredUser(args, "listing open tickets");
  const mailbox = await requireActiveMailbox();
  const limit = parseLimit(args, "limit", 25, 100);
  const latestOnly = args.has("latest");

  const rawStatusArg = getArgString(args, "status");
  const status =
    rawStatusArg !== undefined
      ? rawStatusArg
          .split(",")
          .map((status) => status.trim())
          .filter(Boolean)
      : DEFAULT_OPEN_TICKET_STATUSES;
  const normalizedStatus = status
    .map((value) => parseConversationStatus(value))
    .filter((value): value is (typeof CONVERSATION_STATUSES)[number] => value !== null);

  const result = await searchConversations(
    mailbox,
    {
      status: normalizedStatus.length ? normalizedStatus : DEFAULT_OPEN_TICKET_STATUSES,
      assignee: [actor.id],
      limit,
      sort: latestOnly ? "updated_desc" : "oldest",
    },
    actor.id,
  );

  const { results } = await result.list;
  const selected = latestOnly ? results.slice(0, 1) : results;

  console.log(
    JSON.stringify(
      {
        userId: actor.id,
        latestOnly,
        search: {
          status: normalizedStatus.length ? normalizedStatus : DEFAULT_OPEN_TICKET_STATUSES,
          count: selected.length,
          limit,
        },
        tickets: selected.map((ticket) => ({
          id: ticket.id,
          slug: ticket.slug,
          status: ticket.status,
          subject: ticket.subject,
          customer: ticket.emailFrom,
          assignedToId: ticket.assignedToId,
          updatedAt: ticket.updatedAt?.toISOString() ?? null,
          closedAt: ticket.closedAt?.toISOString() ?? null,
          lastUserEmailCreatedAt: ticket.lastUserEmailCreatedAt?.toISOString() ?? null,
        })),
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
    console.error("Failed to run get-open-tickets script");
  }
  process.exit(1);
}
