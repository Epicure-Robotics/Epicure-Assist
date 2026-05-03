import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { conversations } from "@/db/schema";
import { createReply } from "@/lib/data/conversationMessage";
import { getMailbox } from "@/lib/data/mailbox";
import { captureExceptionAndLog } from "@/lib/shared/sentry";

type SendClosedThreadEmailPayload = {
  conversationId: number;
  closedByUserId: string | null;
};

const CLOSURE_MESSAGE =
  "This support thread has been closed. If you need further assistance, please reply to this email and we'll be happy to help.";

export const sendClosedThreadEmail = async (payload: SendClosedThreadEmailPayload) => {
  try {
    const { conversationId, closedByUserId: _closedByUserId } = payload;

    // Get the conversation to check its current status
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      columns: {
        id: true,
        status: true,
        emailFrom: true,
      },
    });

    if (!conversation) {
      console.log(`[sendClosedThreadEmail] Conversation ${conversationId} not found, skipping`);
      return { skipped: true, reason: "conversation_not_found" };
    }

    // If the conversation was reopened during the 24-hour delay, skip sending
    if (conversation.status !== "closed") {
      console.log(
        `[sendClosedThreadEmail] Conversation ${conversationId} is no longer closed (status: ${conversation.status}), skipping`,
      );
      return { skipped: true, reason: "conversation_reopened" };
    }

    // Check if the feature flag is still enabled
    const mailbox = await getMailbox();
    if (!mailbox?.closedThreadEmailEnabled) {
      console.log(`[sendClosedThreadEmail] Feature flag is disabled, skipping`);
      return { skipped: true, reason: "feature_disabled" };
    }

    // Don't send if there's no customer email
    if (!conversation.emailFrom) {
      console.log(`[sendClosedThreadEmail] Conversation ${conversationId} has no emailFrom, skipping`);
      return { skipped: true, reason: "no_customer_email" };
    }

    // Send the closure notification as a reply in the same thread
    // Using close: false since the conversation is already closed
    await createReply({
      conversationId,
      message: CLOSURE_MESSAGE,
      user: null, // System message
      close: false, // Already closed
      role: "staff",
    });

    console.log(`[sendClosedThreadEmail] Successfully sent closure notification for conversation ${conversationId}`);

    return {
      success: true,
      conversationId,
    };
  } catch (error) {
    captureExceptionAndLog(error);
    throw error;
  }
};
