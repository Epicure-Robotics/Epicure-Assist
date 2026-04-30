import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { conversations } from "@/db/schema/conversations";
import { updateConversation } from "@/lib/data/conversation";
import {
  CONVERSATION_STATUSES,
  getArgString,
  parseArgs,
  parseConversationStatus,
  resolveConversationIdArg,
  resolveUser,
} from "./_helpers";

const usage = `
Usage:
  pnpm with-dev-env tsx pocket-helper-skills/scripts/change-ticket-status.ts \\
    --conversation-id <id> --status <status> [--user-id <uuid>|--user-email <email>] [--note "<text>"]

Valid statuses: ${CONVERSATION_STATUSES.join(", ")}
`;

const run = async () => {
  const args = parseArgs();
  if (args.has("help") || args.has("h")) {
    console.log(usage.trim());
    return;
  }

  const conversationId = resolveConversationIdArg(args, "conversation-id");
  const status = parseConversationStatus(getArgString(args, "status"));
  if (!status) {
    throw new Error(`Missing or invalid --status. Valid values: ${CONVERSATION_STATUSES.join(", ")}`);
  }

  const actor = await resolveUser(args);
  const message = getArgString(args, "note") ?? "Status changed via script";

  const current = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { status: true },
  });
  if (!current) throw new Error(`Conversation ${conversationId} could not be found.`);

  const updated = await updateConversation(conversationId, {
    set: { status },
    byUserId: actor?.id ?? null,
    message,
  });

  if (!updated) {
    throw new Error(`Conversation ${conversationId} could not be found.`);
  }

  console.log(
    JSON.stringify(
      {
        conversationId: updated.id,
        previousStatus: current?.status ?? null,
        currentStatus: updated.status,
        updatedBy: actor?.id ?? null,
        note: message,
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
    console.error("Failed to run change-ticket-status script");
  }
  process.exit(1);
}
