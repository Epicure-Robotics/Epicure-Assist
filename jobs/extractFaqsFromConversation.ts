import { eq } from "drizzle-orm";
import { getBaseUrl } from "@/components/constants";
import { takeUniqueOrThrow } from "@/components/utils/arrays";
import { db } from "@/db/client";
import { conversationMessages, faqs, mailboxes } from "@/db/schema";
import { conversations } from "@/db/schema/conversations";
import { assertDefinedOrRaiseNonRetriableError } from "@/jobs/utils";
import { generateKnowledgeBankSuggestion } from "@/lib/ai/knowledgeBankSuggestions";
import { cleanUpTextForAI } from "@/lib/ai/core";
import { getMailbox } from "@/lib/data/mailbox";
import { getSlackUsersByEmail, postSlackMessage } from "@/lib/slack/client";
import { getSuggestedEditButtons } from "@/lib/slack/shared";

const KNOWLEDGE_SUGGESTION_EMAIL = "bharat@openvision.engineering";

export const extractFaqsFromConversation = async ({
  conversationId,
}: {
  conversationId: number;
}) => {
  return;
  const conversation = assertDefinedOrRaiseNonRetriableError(
    await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    }),
  );

  // Skip spam, prompt test conversations, and visitor-only sessions
  if (conversation.status === "spam" || conversation.isPrompt) {
    return { skipped: true, reason: "spam or prompt conversation" };
  }

  const messages = await db.query.conversationMessages.findMany({
    where: eq(conversationMessages.conversationId, conversationId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });

  // Need at least one agent/AI reply to have anything worth extracting
  const hasAgentReply = messages.some((m) => m.role === "staff" || m.role === "ai_assistant");
  if (!hasAgentReply) {
    return { skipped: true, reason: "no agent reply found" };
  }

  const conversationText = messages
    .filter((m) => m.body || m.cleanedUpText)
    .map((m) => {
      const role = m.role === "user" ? "Customer" : "Agent";
      return `${role}: ${cleanUpTextForAI(m.cleanedUpText ?? m.body ?? "")}`;
    })
    .join("\n");

  const mailbox = assertDefinedOrRaiseNonRetriableError(await getMailbox());

  const suggestion = await generateKnowledgeBankSuggestion(mailbox, {
    type: "resolved_conversation",
    conversationText,
  });

  if (suggestion.action === "no_action" || !suggestion.content?.trim()) {
    return { action: "no_action", reason: suggestion.reason };
  }

  // Check whether a suggested FAQ was already created for this conversation (idempotency
  // guard). If the Slack notification failed and the job is being retried, the row will
  // exist but slackMessageTs will be null — in that case we skip the insert and only
  // re-attempt the notification. If both row and slackMessageTs are present, the job
  // already completed successfully and we return early.
  const alreadyCreated = await db.query.faqs.findFirst({
    where: eq(faqs.sourceConversationId, conversationId),
  });

  if (alreadyCreated) {
    if (!alreadyCreated.slackMessageTs) {
      await notifySuggestedFaq(alreadyCreated, mailbox);
    }
    return { action: "already_exists", faqId: alreadyCreated.id };
  }

  if (suggestion.action === "create_entry") {
    const [newFaq] = await db
      .insert(faqs)
      .values({
        content: suggestion.content,
        suggested: true,
        enabled: false,
        sourceConversationId: conversationId,
      })
      .onConflictDoNothing({ target: faqs.sourceConversationId })
      .returning();

    if (!newFaq) return { action: "already_exists" };
    await notifySuggestedFaq(newFaq, mailbox);
    return { action: "created", faqId: newFaq.id };
  }

  if (suggestion.action === "update_entry" && suggestion.entryId) {
    const existingReplacement = await db.query.faqs.findFirst({
      where: eq(faqs.suggestedReplacementForId, suggestion.entryId),
    });

    if (!existingReplacement) {
      const [newFaq] = await db
        .insert(faqs)
        .values({
          content: suggestion.content,
          suggested: true,
          enabled: false,
          suggestedReplacementForId: suggestion.entryId,
          sourceConversationId: conversationId,
        })
        .onConflictDoNothing({ target: faqs.sourceConversationId })
        .returning();

      if (!newFaq) return { action: "already_exists" };
      await notifySuggestedFaq(newFaq, mailbox);
      return { action: "update_suggested", faqId: newFaq.id };
    }
    return { action: "update_already_pending" };
  }

  return { action: "no_action" };
};

const notifySuggestedFaq = async (faq: typeof faqs.$inferSelect, mailbox: typeof mailboxes.$inferSelect) => {
  if (!mailbox.slackBotToken || !mailbox.slackAlertChannel) return;

  let originalContent = "";
  if (faq.suggestedReplacementForId) {
    const original = await db.query.faqs.findFirst({
      where: eq(faqs.id, faq.suggestedReplacementForId),
    });
    originalContent = original?.content ?? "";
  }

  const usersByEmail = await getSlackUsersByEmail(mailbox.slackBotToken);
  const ephemeralUserId = usersByEmail.get(KNOWLEDGE_SUGGESTION_EMAIL);

  const messageTs = await postSlackMessage(mailbox.slackBotToken, {
    ...(ephemeralUserId ? { ephemeralUserId } : {}),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: originalContent
            ? `💡 New suggested edit for the knowledge bank _(from resolved conversation)_\n\n*Suggested content:*\n${faq.content}\n\n*This will overwrite the current entry:*\n${originalContent}`
            : `💡 New suggested addition to the knowledge bank _(from resolved conversation)_\n\n*Suggested content:*\n${faq.content}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<${getBaseUrl()}/settings/knowledge|View knowledge bank>`,
        },
      },
      getSuggestedEditButtons(faq.id),
    ],
    channel: mailbox.slackAlertChannel,
  });

  await db
    .update(faqs)
    .set({ slackChannel: mailbox.slackAlertChannel, slackMessageTs: messageTs })
    .where(eq(faqs.id, faq.id));
};
