import { KnownBlock } from "@slack/web-api";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { conversations, notes, userProfiles } from "@/db/schema";
import { getMailbox } from "@/lib/data/mailbox";
import { env } from "@/lib/env";
import { generatePublicConversationToken } from "@/lib/publicConversationToken";
import { captureExceptionAndLog } from "@/lib/shared/sentry";
import { postSlackMessage } from "@/lib/slack/client";

type PostInternalNoteToSlackPayload = {
  noteId: number;
  conversationId: number;
  triggeredByUserId?: string;
  slackChannelId?: string;
};

export const postInternalNoteToSlack = async (payload: PostInternalNoteToSlackPayload) => {
  try {
    const { noteId, conversationId, triggeredByUserId, slackChannelId } = payload;

    console.log("[postInternalNoteToSlack] Starting with payload:", JSON.stringify(payload));

    if (!noteId || !conversationId) {
      console.log("[postInternalNoteToSlack] Missing required fields");
      return { success: false, reason: "Missing required fields" };
    }

    // Get mailbox configuration for Slack
    const mailbox = await getMailbox();

    if (!mailbox?.slackBotToken || !mailbox.slackAlertChannel) {
      console.log("[postInternalNoteToSlack] Slack not configured or alert channel not set");
      return { success: false, reason: "Slack not configured" };
    }

    // Fetch the note
    const note = await db.query.notes.findFirst({
      where: eq(notes.id, noteId),
      columns: {
        id: true,
        body: true,
        createdAt: true,
      },
    });

    if (!note) {
      throw new Error(`Note ${noteId} not found`);
    }

    // Fetch conversation details
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      columns: {
        id: true,
        slug: true,
        subject: true,
        emailFrom: true,
        assignedToId: true,
      },
    });

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Get the user who created the note
    let authorName = "Unknown";
    if (triggeredByUserId) {
      const author = await db.query.userProfiles.findFirst({
        where: eq(userProfiles.id, triggeredByUserId),
        columns: {
          displayName: true,
        },
        with: {
          user: {
            columns: {
              email: true,
            },
          },
        },
      });
      authorName = author?.displayName || author?.user?.email || "Unknown";
    }

    // Format the note content for Slack
    const conversationLink = `${env.AUTH_URL}/conversations?id=${conversation.slug}`;
    const conversationSubject = conversation.subject || "Untitled Conversation";
    const customerEmail = conversation.emailFrom || "Unknown";

    // Generate public link for users without Helper access
    const publicToken = generatePublicConversationToken(conversation.id);
    const publicLink = `${env.AUTH_URL}/api/public/conversation/${publicToken}`;

    // Build Slack message blocks
    const blocks: KnownBlock[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `📝 *Internal Note Added*\n*Conversation:* ${conversationSubject}\n*Customer:* ${customerEmail}\n*Added by:* ${authorName}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `> ${note.body.replace(/\n/g, "\n> ")}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<${conversationLink}|View in Helper> • <${publicLink}|View Email (Public)>`,
        },
      },
    ];

    // Post to Slack - use selected channel or fall back to default alert channel
    const targetChannel = slackChannelId || mailbox.slackAlertChannel;
    const messageTs = await postSlackMessage(mailbox.slackBotToken, {
      channel: targetChannel,
      text: `Internal note added by ${authorName} to "${conversationSubject}"`,
      blocks,
    });

    await db
      .update(notes)
      .set({
        slackChannel: targetChannel,
        slackMessageTs: messageTs,
      })
      .where(eq(notes.id, noteId));

    console.log("[postInternalNoteToSlack] Posted to Slack successfully:", messageTs, "Channel:", targetChannel);

    return {
      success: true,
      messageTs,
      channel: targetChannel,
    };
  } catch (error) {
    console.error("[postInternalNoteToSlack] Fatal error:", error);
    captureExceptionAndLog(error);
    throw error;
  }
};
