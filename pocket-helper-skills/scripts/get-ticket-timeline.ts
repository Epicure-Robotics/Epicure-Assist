import { getConversationById } from "@/lib/data/conversation";
import { getMessages } from "@/lib/data/conversationMessage";
import { requireActiveMailbox, parseArgs, resolveConversationIdArg } from "./_helpers";

const usage = `
Usage:
  pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/get-ticket-timeline.ts \\
    --conversation-id <id>
`;

const run = async () => {
  const args = parseArgs();
  if (args.has("help") || args.has("h")) {
    console.log(usage.trim());
    return;
  }

  const conversationId = resolveConversationIdArg(args, "conversation-id");
  const mailbox = await requireActiveMailbox();
  const conversation = await getConversationById(conversationId);

  if (!conversation) {
    throw new Error(`Conversation ${conversationId} could not be found.`);
  }

  const timeline = await getMessages(conversationId, mailbox);

  console.log(
    JSON.stringify(
      {
        conversation: {
          id: conversation.id,
          slug: conversation.slug,
          status: conversation.status,
          subject: conversation.subject,
          customer: conversation.emailFrom,
          assignedToId: conversation.assignedToId,
          updatedAt: conversation.updatedAt?.toISOString() ?? null,
          closedAt: conversation.closedAt?.toISOString() ?? null,
          lastUserEmailCreatedAt: conversation.lastUserEmailCreatedAt?.toISOString() ?? null,
        },
        timeline,
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
    console.error("Failed to run get-ticket-timeline script");
  }
  process.exit(1);
}
