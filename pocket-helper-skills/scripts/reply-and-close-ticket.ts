import { getConversationById } from "@/lib/data/conversation";
import { createReply } from "@/lib/data/conversationMessage";
import {
  getArgString,
  normalizeEscapedMultilineArg,
  parseArgs,
  parseOptionalCSV,
  resolveConversationIdArg,
  resolveRequiredUser,
} from "./_helpers";

const usage = `
Usage:
  pnpm with-dev-env tsx pocket-helper-skills/scripts/reply-and-close-ticket.ts \\
    --conversation-id <id> --user-id <uuid>|--user-email <email> \\
    --message "<text>" [--to user@domain.com] [--cc user@domain.com,...] [--bcc user@domain.com,...] \\
    [--no-close] [--no-auto-assign] [--response-to-id <id>] [--file-slugs slug1,slug2]
`;

const run = async () => {
  const args = parseArgs();
  if (args.has("help") || args.has("h")) {
    console.log(usage.trim());
    return;
  }

  const conversationId = resolveConversationIdArg(args, "conversation-id");
  const actor = await resolveRequiredUser(args, "replying to a ticket");
  const close = !args.has("no-close");
  const shouldAutoAssign = !args.has("no-auto-assign");
  const htmlBody = getArgString(args, "html-body");
  const message = normalizeEscapedMultilineArg(getArgString(args, "message")) ?? htmlBody;
  if (!message) throw new Error("Missing --message (or --html-body)");
  const responseToId = getArgString(args, "response-to-id")
    ? Number.parseInt(getArgString(args, "response-to-id") ?? "", 10)
    : undefined;

  if (responseToId !== undefined && (!Number.isInteger(responseToId) || responseToId <= 0)) {
    throw new Error(`Invalid --response-to-id: ${getArgString(args, "response-to-id")}`);
  }

  const createdMessageId = await createReply({
    conversationId,
    message,
    htmlBody,
    user: actor,
    role: "staff",
    to: parseOptionalCSV(getArgString(args, "to")),
    cc: parseOptionalCSV(getArgString(args, "cc")),
    bcc: parseOptionalCSV(getArgString(args, "bcc")),
    fileSlugs: parseOptionalCSV(getArgString(args, "file-slugs")) ?? [],
    close,
    shouldAutoAssign,
    responseToId: responseToId ?? null,
  });

  const conversation = await getConversationById(conversationId);

  console.log(
    JSON.stringify(
      {
        conversationId,
        conversationSlug: conversation?.slug ?? null,
        status: conversation?.status ?? null,
        closed: close ? "true" : "false",
        createdMessageId,
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
    console.error("Failed to run reply-and-close-ticket script");
  }
  process.exit(1);
}
