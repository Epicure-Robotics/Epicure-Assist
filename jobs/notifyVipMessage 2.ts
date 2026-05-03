import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { conversationMessages, conversations } from "@/db/schema";
import { ensureCleanedUpText } from "@/lib/data/conversationMessage";
import { getMailbox } from "@/lib/data/mailbox";
import { getPlatformCustomer } from "@/lib/data/platformCustomer";
import { getBasicProfileById } from "@/lib/data/user";
import { postVipMessageToSlack, updateVipMessageInSlack } from "@/lib/slack/vipNotifications";
import { assertDefinedOrRaiseNonRetriableError } from "./utils";

type MessageWithConversationAndMailbox = typeof conversationMessages.$inferSelect & {
  conversation: typeof conversations.$inferSelect;
};

async function fetchConversationMessage(messageId: number): Promise<MessageWithConversationAndMailbox> {
  const message = assertDefinedOrRaiseNonRetriableError(
    await db.query.conversationMessages.findFirst({
      where: eq(conversationMessages.id, messageId),
      with: {
        conversation: {},
      },
    }),
  );

  if (message.conversation.mergedIntoId) {
    const mergedConversation = assertDefinedOrRaiseNonRetriableError(
      await db.query.conversations.findFirst({
        where: eq(conversations.id, message.conversation.mergedIntoId),
      }),
    );

    return { ...message, conversation: mergedConversation };
  }

  return message;
}

async function handleVipSlackMessage(message: MessageWithConversationAndMailbox) {
  const conversation = assertDefinedOrRaiseNonRetriableError(message.conversation);
  const mailbox = assertDefinedOrRaiseNonRetriableError(await getMailbox());

  if (conversation.isPrompt) {
    return "Not posted, prompt conversation";
  }
  if (!conversation.emailFrom) {
    return "Not posted, anonymous conversation";
  }

  const platformCustomer = await getPlatformCustomer(conversation.emailFrom);

  const cleanedUpTextForAlert = await ensureCleanedUpText(message);
  const keywordPriorityLead =
    /\b(factory|manufactur|500\s+employees)\b/i.test(cleanedUpTextForAlert) ||
    /\benterprise\b/i.test(cleanedUpTextForAlert);

  if (!platformCustomer?.isVip && !keywordPriorityLead) return "Not posted, not a VIP customer";
  if (!mailbox.slackBotToken || !mailbox.vipChannelId) {
    return "Not posted, mailbox not linked to Slack";
  }

  const slackPlatformCustomer = platformCustomer
    ? { ...platformCustomer, isVip: platformCustomer.isVip || keywordPriorityLead }
    : ({
        id: 0,
        unused_mailboxId: mailbox.id,
        email: assertDefinedOrRaiseNonRetriableError(conversation.emailFrom),
        name: null,
        value: null,
        links: null,
        metadata: { highPriorityKeyword: true },
        createdAt: new Date(),
        updatedAt: new Date(),
        isVip: true,
      } as Awaited<ReturnType<typeof getPlatformCustomer>> & { isVip: boolean });

  // If it's an agent reply updating an existing Slack message
  if (message.role !== "user" && message.responseToId) {
    const originalMessage = await db.query.conversationMessages.findFirst({
      where: eq(conversationMessages.id, message.responseToId),
    });

    if (originalMessage?.slackMessageTs) {
      const originalCleanedUpText = originalMessage ? await ensureCleanedUpText(originalMessage) : "";
      const replyCleanedUpText = await ensureCleanedUpText(message);

      await updateVipMessageInSlack({
        conversation,
        mailbox,
        originalMessage: originalCleanedUpText,
        replyMessage: replyCleanedUpText,
        slackBotToken: mailbox.slackBotToken,
        slackChannel: mailbox.vipChannelId,
        slackMessageTs: originalMessage.slackMessageTs,
        user: message.userId ? await getBasicProfileById(message.userId) : null,
        email: true,
        closed: conversation.status === "closed",
      });
      return "Updated";
    }
  }

  if (message.role !== "user") {
    return "Not posted, not a user message and not a reply to a user message";
  }

  const cleanedUpText = await ensureCleanedUpText(message);

  const slackMessageTs = await postVipMessageToSlack({
    conversation,
    mailbox,
    message: cleanedUpText,
    platformCustomer: slackPlatformCustomer,
    slackBotToken: mailbox.slackBotToken,
    slackChannel: mailbox.vipChannelId,
  });

  await db
    .update(conversationMessages)
    .set({ slackMessageTs, slackChannel: mailbox.vipChannelId })
    .where(eq(conversationMessages.id, message.id));
  return "Posted";
}

export const notifyVipMessage = async ({ messageId }: { messageId: number }) => {
  const message = assertDefinedOrRaiseNonRetriableError(await fetchConversationMessage(messageId));
  return await handleVipSlackMessage(message);
};
