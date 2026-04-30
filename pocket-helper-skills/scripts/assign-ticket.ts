import { updateConversation } from "@/lib/data/conversation";
import { getBasicProfileByEmail, getBasicProfileById } from "@/lib/data/user";
import { parseArgs, requireActiveMailbox, resolveConversationIdArg, resolveUser } from "./_helpers";

const usage = `
Usage:
  pnpm with-dev-env tsx pocket-helper-skills/scripts/assign-ticket.ts \\
    --conversation-id <id> --assignee-id <uuid>|--assignee-email <email> [--user-id <uuid>|--user-email <email>]

  # Unassign:
  pnpm with-dev-env tsx pocket-helper-skills/scripts/assign-ticket.ts --conversation-id <id> --unassign
`;

const run = async () => {
  const args = parseArgs();
  if (args.has("help") || args.has("h")) {
    console.log(usage.trim());
    return;
  }

  const conversationId = resolveConversationIdArg(args, "conversation-id");
  const actor = await resolveUser(args);
  await requireActiveMailbox();

  const unassign = args.has("unassign");
  const assigneeId = args.get("assignee-id");
  const assigneeEmail = args.get("assignee-email");

  if (!unassign && !assigneeId && !assigneeEmail) {
    throw new Error("Provide --assignee-id, --assignee-email, or --unassign.");
  }

  let assignedToId: string | null = null;
  if (!unassign) {
    const assignee =
      typeof assigneeId === "string"
        ? await getBasicProfileById(assigneeId)
        : typeof assigneeEmail === "string"
          ? await getBasicProfileByEmail(assigneeEmail)
          : null;

    if (!assignee?.id) {
      throw new Error("Could not resolve assignee. Check --assignee-id/--assignee-email.");
    }
    assignedToId = assignee.id;
  }

  const updated = await updateConversation(conversationId, {
    set: {
      assignedToId,
      ...(args.has("assigned-to-ai") ? { assignedToAI: true } : {}),
    },
    byUserId: actor?.id ?? null,
    message: unassign ? "Ticket unassigned via script" : "Ticket assigned via script",
  });

  if (!updated) {
    throw new Error(`Conversation ${conversationId} could not be found.`);
  }

  console.log(
    JSON.stringify(
      {
        conversationId: updated.id,
        assignedToId: updated.assignedToId,
        assignedToAI: updated.assignedToAI,
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
    console.error("Failed to run assign-ticket script");
  }
  process.exit(1);
}
