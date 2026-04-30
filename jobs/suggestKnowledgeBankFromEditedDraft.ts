import { eq } from "drizzle-orm";
import { getBaseUrl } from "@/components/constants";
import { db } from "@/db/client";
import { conversationMessages, faqs, mailboxes } from "@/db/schema";
import { assertDefinedOrRaiseNonRetriableError } from "@/jobs/utils";
import { generateKnowledgeBankSuggestion } from "@/lib/ai/knowledgeBankSuggestions";
import { getMailbox } from "@/lib/data/mailbox";
import { getSlackUsersByEmail, postSlackMessage } from "@/lib/slack/client";
import { getSuggestedEditButtons } from "@/lib/slack/shared";

const KNOWLEDGE_SUGGESTION_EMAIL = "bharat@openvision.engineering";

// Fired when a staff member edits an AI draft before sending. The sent message
// is analyzed as a human reply worth extracting knowledge from.
export const suggestKnowledgeBankFromEditedDraft = async ({ messageId }: { messageId: number }) => {
  return;
  const message = assertDefinedOrRaiseNonRetriableError(
    await db.query.conversationMessages.findFirst({
      where: eq(conversationMessages.id, messageId),
    }),
  );

  if (message.role !== "staff" || !message.body?.trim()) {
    return { skipped: true, reason: "not a staff reply or empty body" };
  }

  const mailbox = assertDefinedOrRaiseNonRetriableError(await getMailbox());
  const messageContent = message.cleanedUpText || message.body || "";

  const existingSuggestions = await db.query.faqs.findMany({
    where: eq(faqs.suggested, true),
  });

  const suggestion = await generateKnowledgeBankSuggestion(mailbox, {
    type: "human_reply",
    messageContent,
  });

  if (suggestion.action === "no_action" || !suggestion.content?.trim()) {
    return { action: "no_action", reason: suggestion.reason };
  }

  if (suggestion.action === "create_entry") {
    const newFaq = await db
      .insert(faqs)
      .values({
        content: suggestion.content,
        suggested: true,
        enabled: false,
        messageId: message.id,
      })
      .onConflictDoNothing({ target: faqs.messageId })
      .returning()
      .then((rows) => rows[0]);

    if (!newFaq) return { action: "already_exists" };
    await notifySuggestedEdit(newFaq, mailbox);
    return { action: "created", faqId: newFaq.id };
  }

  if (suggestion.action === "update_entry") {
    const alreadyPending = existingSuggestions.find((f) => f.suggestedReplacementForId === suggestion.entryId);
    if (!alreadyPending) {
      const newFaq = await db
        .insert(faqs)
        .values({
          content: suggestion.content,
          suggested: true,
          enabled: false,
          suggestedReplacementForId: suggestion.entryId,
          messageId: message.id,
        })
        .onConflictDoNothing({ target: faqs.messageId })
        .returning()
        .then((rows) => rows[0]);

      if (!newFaq) return { action: "already_exists" };
      await notifySuggestedEdit(newFaq, mailbox);
      return { action: "update_suggested", faqId: newFaq.id };
    }
    return { action: "update_already_pending" };
  }

  return { action: "no_action" };
};

const notifySuggestedEdit = async (faq: typeof faqs.$inferSelect, mailbox: typeof mailboxes.$inferSelect) => {
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
            ? `💡 New suggested edit for the knowledge bank _(from edited draft)_\n\n*Suggested content:*\n${faq.content}\n\n*This will overwrite the current entry:*\n${originalContent}`
            : `💡 New suggested addition to the knowledge bank _(from edited draft)_\n\n*Suggested content:*\n${faq.content}`,
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
