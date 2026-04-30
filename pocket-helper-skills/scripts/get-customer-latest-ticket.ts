import { getConversationById } from "@/lib/data/conversation";
import { searchConversations } from "@/lib/data/conversation/search";
import {
  getArgString,
  normalizeStatusList,
  parseArgs,
  requireActiveMailbox,
  type ConversationStatus,
} from "./_helpers";

const DEFAULT_CUSTOMER_TICKET_STATUSES: ConversationStatus[] = ["open", "waiting_on_customer", "check_back_later"];

const usage = `
Usage:
  pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/get-customer-latest-ticket.ts \\
    --email <customer-email> [--status <comma-separated>]
`;

const toISOStringOrNull = (value: Date | string | null | undefined) => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
};

const run = async () => {
  const args = parseArgs();
  if (args.has("help") || args.has("h")) {
    console.log(usage.trim());
    return;
  }

  const customerEmail = getArgString(args, "email")?.trim().toLowerCase();
  if (!customerEmail) {
    throw new Error("Missing --email");
  }

  const mailbox = await requireActiveMailbox();
  const statuses = normalizeStatusList(args);
  const appliedStatuses = statuses.length ? statuses : DEFAULT_CUSTOMER_TICKET_STATUSES;

  const result = await searchConversations(mailbox, {
    customer: [customerEmail],
    status: appliedStatuses,
    sort: "newest",
    limit: 1,
  });
  const list = await result.list;
  const latestTicket = list.results[0];

  if (!latestTicket) {
    console.log(
      JSON.stringify(
        {
          customerEmail,
          search: {
            status: appliedStatuses,
            sort: "newest",
            limit: 1,
          },
          ticket: null,
        },
        null,
        2,
      ),
    );
    return;
  }

  const conversation = await getConversationById(latestTicket.id);
  if (!conversation) {
    throw new Error(`Conversation ${latestTicket.id} could not be found.`);
  }

  console.log(
    JSON.stringify(
      {
        customerEmail,
        search: {
          status: appliedStatuses,
          sort: "newest",
          limit: 1,
        },
        ticket: {
          id: conversation.id,
          slug: conversation.slug,
          status: conversation.status,
          subject: conversation.subject,
          customer: conversation.emailFrom,
          assignedToId: conversation.assignedToId,
          updatedAt: toISOStringOrNull(conversation.updatedAt),
          closedAt: toISOStringOrNull(conversation.closedAt),
          lastUserEmailCreatedAt: toISOStringOrNull(conversation.lastUserEmailCreatedAt),
        },
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
    console.error("Failed to run get-customer-latest-ticket script");
  }
  process.exit(1);
}
