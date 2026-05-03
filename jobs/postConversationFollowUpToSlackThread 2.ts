import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { conversationMessages, conversations, notes } from "@/db/schema";
import { ensureCleanedUpText } from "@/lib/data/conversationMessage";
import { getMailbox } from "@/lib/data/mailbox";
import { postSlackMessage } from "@/lib/slack/client";
import { assertDefinedOrRaiseNonRetriableError } from "./utils";

export const postConversationFollowUpToSlackThread = async ({ messageId }: { messageId: number }) => {
  const message = assertDefinedOrRaiseNonRetriableError(
    await db.query.conversationMessages.findFirst({
      where: eq(conversationMessages.id, messageId),
    }),
  );

  if (message.role !== "user") {
    return "Not posted, not a user follow-up";
  }

  const mailbox = await getMailbox();
  if (!mailbox?.slackBotToken) {
    return "Not posted, Slack not configured";
  }

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, message.conversationId),
    columns: {
      id: true,
      slug: true,
      subject: true,
      emailFrom: true,
    },
  });
  if (!conversation) {
    return "Not posted, conversation not found";
  }

  const latestSlackNote = await db.query.notes.findFirst({
    where: and(
      eq(notes.conversationId, message.conversationId),
      isNotNull(notes.slackChannel),
      isNotNull(notes.slackMessageTs),
    ),
    columns: {
      slackChannel: true,
      slackMessageTs: true,
      createdAt: true,
    },
    orderBy: [desc(notes.createdAt)],
  });

  if (!latestSlackNote?.slackChannel || !latestSlackNote.slackMessageTs) {
    return "Not posted, no internal note thread found";
  }

  if (latestSlackNote.createdAt > message.createdAt) {
    return "Not posted, note thread created after message";
  }

  const cleanedMessage = await ensureCleanedUpText(message);
  const conversationSubject = conversation.subject || "Untitled Conversation";
  const customerEmail = conversation.emailFrom || "Unknown";

  const messageTs = await postSlackMessage(mailbox.slackBotToken, {
    channel: latestSlackNote.slackChannel,
    thread_ts: latestSlackNote.slackMessageTs,
    text: `Customer follow-up in "${conversationSubject}" from ${customerEmail}`,
    unfurl_links: false,
    unfurl_media: false,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `📨 *New Customer Follow-up*\n*Conversation:* ${conversationSubject}\n*Customer:* ${customerEmail}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `> ${cleanedMessage.replace(/\n/g, "\n> ")}`,
        },
      },
    ],
  });

  await db
    .update(conversationMessages)
    .set({
      slackChannel: latestSlackNote.slackChannel,
      slackMessageTs: messageTs,
    })
    .where(and(eq(conversationMessages.id, message.id), isNull(conversationMessages.slackMessageTs)));

  return "Posted";
};
