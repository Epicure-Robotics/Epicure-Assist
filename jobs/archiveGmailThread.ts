import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { conversationMessages, conversations, gmailSupportEmails } from "@/db/schema";
import { getMailbox } from "@/lib/data/mailbox";
import { archiveGmailThread, getGmailService } from "@/lib/gmail/client";
import { captureExceptionAndLog } from "@/lib/shared/sentry";

export const archiveGmailThreadJob = async ({ conversationId }: { conversationId: number }) => {
  // eslint-disable-next-line no-console
  console.log(`[archiveGmailThreadJob] Starting for conversation ${conversationId}`);
  try {
    // Get the conversation
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    });

    if (!conversation) {
      // eslint-disable-next-line no-console
      console.log(`[archiveGmailThreadJob] Conversation ${conversationId} not found`);
      return null;
    }
    
    // eslint-disable-next-line no-console
    console.log(`[archiveGmailThreadJob] Found conversation ${conversationId}`);

    // Get the Gmail thread ID from any message in the conversation
    const messageWithGmailThread = await db.query.conversationMessages.findFirst({
      where: and(
        eq(conversationMessages.conversationId, conversationId),
        isNotNull(conversationMessages.gmailThreadId),
        isNull(conversationMessages.deletedAt),
      ),
    });

    if (!messageWithGmailThread?.gmailThreadId) {
      // eslint-disable-next-line no-console
      console.log(`No Gmail thread found for conversation ${conversationId}`);
      return null;
    }

    // Get the mailbox and Gmail support email
    const mailbox = await getMailbox();
    // eslint-disable-next-line no-console
    console.log(`[archiveGmailThreadJob] Mailbox preferences:`, mailbox?.preferences);
    
    // Check if the feature is enabled for this mailbox
    if (!mailbox?.preferences?.archiveGmailOnReply) {
      // eslint-disable-next-line no-console
      console.log(`[archiveGmailThreadJob] Gmail archiving is NOT enabled for mailbox ${mailbox?.id}`);
      return null;
    }
    
    // eslint-disable-next-line no-console
    console.log(`[archiveGmailThreadJob] Gmail archiving IS enabled for mailbox ${mailbox?.id}`);

    const gmailSupportEmail = mailbox?.gmailSupportEmailId
      ? await db.query.gmailSupportEmails.findFirst({
          where: eq(gmailSupportEmails.id, mailbox.gmailSupportEmailId),
        })
      : null;

    if (!gmailSupportEmail) {
      // eslint-disable-next-line no-console
      console.log(`No Gmail support email configured for mailbox`);
      return null;
    }

    // Archive the Gmail thread
    const gmailService = getGmailService(gmailSupportEmail);
    await archiveGmailThread(gmailService, messageWithGmailThread.gmailThreadId);

    // eslint-disable-next-line no-console
    console.log(
      `Successfully archived Gmail thread ${messageWithGmailThread.gmailThreadId} for conversation ${conversationId}`,
    );

    return {
      conversationId,
      gmailThreadId: messageWithGmailThread.gmailThreadId,
      archived: true,
    };
  } catch (error) {
    captureExceptionAndLog(error);
    // eslint-disable-next-line no-console
    console.error(`Failed to archive Gmail thread for conversation ${conversationId}:`, error);
    throw error;
  }
};
