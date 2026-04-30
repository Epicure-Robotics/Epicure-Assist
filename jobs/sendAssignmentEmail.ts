import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import MailComposer from "nodemailer/lib/mail-composer";
import { db } from "@/db/client";
import { conversationMessages, conversations, mailboxes, userProfiles } from "@/db/schema";
import { getGmailSupportEmail } from "@/lib/data/gmailSupportEmail";
import { getGmailService, sendGmailEmail } from "@/lib/gmail/client";
import { formatGmailFromAddress } from "@/lib/gmail/format";
import { captureExceptionAndLog } from "@/lib/shared/sentry";

type SendAssignmentEmailPayload = {
  conversationId: number;
  newAssigneeId: string;
  triggeredByUserId: string;
};

export const sendAssignmentEmail = async (payload: SendAssignmentEmailPayload) => {
  try {
    const { conversationId, newAssigneeId, triggeredByUserId } = payload;

    if (!conversationId || !newAssigneeId || !triggeredByUserId) {
      return;
    }

    // Skip if assignee triggered the assignment themselves
    if (newAssigneeId === triggeredByUserId) {
      console.log(`[sendAssignmentEmail] Skipping: self-assignment`);
      return;
    }

    // Fetch assignee with email and preferences
    const assignee = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.id, newAssigneeId),
      columns: {
        id: true,
        displayName: true,
        preferences: true,
      },
      with: {
        user: {
          columns: {
            email: true,
          },
        },
      },
    });

    if (!assignee) {
      throw new Error(`Assignee ${newAssigneeId} not found`);
    }

    // Check if assignee has email on assignment enabled
    const emailOnAssignment = assignee.preferences?.notifications?.emailOnAssignment ?? false;
    if (!emailOnAssignment) {
      console.log(`[sendAssignmentEmail] Skipping: emailOnAssignment not enabled for user ${newAssigneeId}`);
      return;
    }

    const assigneeEmail = assignee.user?.email;
    if (!assigneeEmail) {
      console.log(`[sendAssignmentEmail] Skipping: no email for user ${newAssigneeId}`);
      return;
    }

    // Fetch conversation details
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      columns: {
        id: true,
        slug: true,
        subject: true,
        emailFrom: true,
        unused_mailboxId: true,
      },
    });

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Fetch mailbox - use conversation's mailbox if it has one, otherwise use default mailbox
    let mailbox;
    if (conversation.unused_mailboxId && conversation.unused_mailboxId !== 0) {
      mailbox = await db.query.mailboxes.findFirst({
        where: eq(mailboxes.id, conversation.unused_mailboxId),
      });
    }

    // If no mailbox found (e.g., chat conversation), use the first/default mailbox
    if (!mailbox) {
      console.log(`[sendAssignmentEmail] Conversation ${conversationId} has no mailbox, using default mailbox`);
      mailbox = await db.query.mailboxes.findFirst({
        orderBy: (mailboxes, { asc }) => [asc(mailboxes.id)],
      });
    }

    if (!mailbox) {
      console.log(`[sendAssignmentEmail] Skipping: no mailbox found (not even a default mailbox)`);
      return;
    }

    // Get Gmail support email credentials
    const gmailSupportEmail = await getGmailSupportEmail(mailbox);
    if (!gmailSupportEmail) {
      console.log(`[sendAssignmentEmail] Skipping: Gmail not connected for mailbox ${mailbox.id}`);
      return;
    }

    // Get all messages in the conversation thread (excluding AI assistant messages)
    const messages = await db.query.conversationMessages.findMany({
      where: and(
        eq(conversationMessages.conversationId, conversationId),
        isNull(conversationMessages.deletedAt),
        inArray(conversationMessages.role, ["user", "staff"]),
      ),
      orderBy: [sql`${conversationMessages.createdAt} asc`],
    });

    if (messages.length === 0) {
      console.log(`[sendAssignmentEmail] Skipping: no messages in conversation ${conversationId}`);
      return;
    }

    // Build forward body with all messages
    let forwardBody = "";
    forwardBody += `<p style="margin-bottom: 20px;"><em>You have been assigned to this ticket.</em></p>`;
    forwardBody += `<div style="margin: 20px 0; padding: 15px; border-left: 3px solid #ccc; background: #f5f5f5;">`;
    forwardBody += `<p style="margin: 0 0 10px; font-weight: bold;">---------- Forwarded conversation ----------</p>`;
    forwardBody += `<p style="margin: 5px 0;"><strong>Subject:</strong> ${conversation.subject || "(no subject)"}</p>`;
    forwardBody += `<p style="margin: 5px 0;"><strong>Customer:</strong> ${conversation.emailFrom || "Unknown"}</p>`;
    forwardBody += `<p style="margin: 5px 0;"><strong>Messages:</strong> ${messages.length}</p>`;
    forwardBody += `</div>`;

    // Add all messages (only user and staff)
    messages.forEach((msg, index) => {
      const roleLabel = msg.role === "user" ? "Customer" : "Staff";
      forwardBody += `<div style="margin: 20px 0; padding: 15px; border-left: 2px solid ${msg.role === "user" ? "#3b82f6" : "#10b981"}; background: #fafafa;">`;
      forwardBody += `<p style="margin: 0 0 5px; font-size: 12px; color: #666;"><strong>${roleLabel}</strong> - ${msg.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>`;
      if (msg.emailFrom) {
        forwardBody += `<p style="margin: 0 0 10px; font-size: 12px; color: #666;">From: ${msg.emailFrom}</p>`;
      }
      forwardBody += `<div>${msg.htmlBody || msg.body || "<p>(no content)</p>"}</div>`;
      forwardBody += `</div>`;
      if (index < messages.length - 1) {
        forwardBody += `<hr style="border: none; border-top: 1px solid #e5e5e5; margin: 10px 0;" />`;
      }
    });

    const fromAddress = formatGmailFromAddress(gmailSupportEmail.email, mailbox.name);

    // Create raw email using MailComposer
    const mailComposer = new MailComposer({
      from: fromAddress,
      to: [assigneeEmail],
      subject: `Assigned: ${conversation.subject || "(no subject)"}`,
      html: forwardBody,
      textEncoding: "base64",
    });

    const rawEmail = await new Promise<string>((resolve, reject) => {
      mailComposer.compile().build((err, message) => {
        if (err) reject(err);
        else resolve(Buffer.from(message).toString("base64url"));
      });
    });

    // Send via Gmail API
    const gmailService = getGmailService(gmailSupportEmail);
    await sendGmailEmail(gmailService, rawEmail, null);

    console.log(`[sendAssignmentEmail] Successfully forwarded conversation ${conversationId} to ${assigneeEmail}`);

    return {
      conversationId,
      assigneeId: newAssigneeId,
      emailForwarded: true,
    };
  } catch (error) {
    captureExceptionAndLog(error);
    // Don't throw - we don't want assignment to fail if email forwarding fails
    return {
      conversationId: payload.conversationId,
      assigneeId: payload.newAssigneeId,
      emailForwarded: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
