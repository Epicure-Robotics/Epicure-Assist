import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import MailComposer from "nodemailer/lib/mail-composer";
import { db } from "@/db/client";
import { conversationMessages, conversations } from "@/db/schema";
import { getGmailSupportEmail } from "@/lib/data/gmailSupportEmail";
import { getMailbox } from "@/lib/data/mailbox";
import { getGmailService, sendGmailEmail } from "@/lib/gmail/client";
import { formatGmailFromAddress } from "@/lib/gmail/format";
import { captureExceptionAndLog } from "@/lib/shared/sentry";

interface BulkForwardPayload {
  userId: string;
  conversationSlugs: string[];
  to: string[];
  note?: string;
  includeFullThread: boolean;
}

export const bulkForwardConversations = async (payload: BulkForwardPayload): Promise<void> => {
  const { conversationSlugs, to, note, includeFullThread } = payload;

  const mailbox = await getMailbox();
  if (!mailbox) {
    throw new Error("Mailbox not found");
  }

  const gmailSupportEmail = await getGmailSupportEmail(mailbox);
  if (!gmailSupportEmail) {
    throw new Error("Gmail is not connected");
  }

  const gmailService = getGmailService(gmailSupportEmail);
  const fromAddress = formatGmailFromAddress(gmailSupportEmail.email, mailbox.name);
  let successCount = 0;
  let errorCount = 0;

  for (const slug of conversationSlugs) {
    try {
      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.slug, slug),
      });

      if (!conversation) {
        console.warn(`Conversation ${slug} not found, skipping`);
        errorCount++;
        continue;
      }

      let forwardBody = "";

      if (includeFullThread) {
        // Forward entire conversation thread
        const messages = await db.query.conversationMessages.findMany({
          where: and(
            eq(conversationMessages.conversationId, conversation.id),
            isNull(conversationMessages.deletedAt),
            inArray(conversationMessages.role, ["user", "staff"]),
          ),
          orderBy: [sql`${conversationMessages.createdAt} asc`],
        });

        if (messages.length === 0) {
          console.warn(`No messages found in conversation ${slug}, skipping`);
          errorCount++;
          continue;
        }

        if (note) {
          forwardBody += `<p>${note}</p><br/>`;
        }

        forwardBody += `<div style="margin: 20px 0; padding: 15px; border-left: 3px solid #ccc; background: #f5f5f5;">`;
        forwardBody += `<p style="margin: 0 0 10px; font-weight: bold;">---------- Forwarded conversation ----------</p>`;
        forwardBody += `<p style="margin: 5px 0;"><strong>Subject:</strong> ${conversation.subject || "(no subject)"}</p>`;
        forwardBody += `<p style="margin: 5px 0;"><strong>Messages:</strong> ${messages.length}</p>`;
        forwardBody += `</div>`;

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
      } else {
        // Forward single first message
        const message = await db.query.conversationMessages.findFirst({
          where: and(eq(conversationMessages.conversationId, conversation.id), isNull(conversationMessages.deletedAt)),
          orderBy: [sql`${conversationMessages.createdAt} asc`],
        });

        if (!message) {
          console.warn(`No message found in conversation ${slug}, skipping`);
          errorCount++;
          continue;
        }

        if (note) {
          forwardBody += `<p>${note}</p><br/>`;
        }

        forwardBody += `<div style="margin: 20px 0; padding: 15px; border-left: 3px solid #ccc; background: #f5f5f5;">`;
        forwardBody += `<p style="margin: 0 0 10px; font-weight: bold;">---------- Forwarded message ----------</p>`;
        forwardBody += `<p style="margin: 5px 0;"><strong>From:</strong> ${message.emailFrom || "Unknown"}</p>`;
        forwardBody += `<p style="margin: 5px 0;"><strong>Date:</strong> ${message.createdAt.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}</p>`;
        forwardBody += `<p style="margin: 5px 0;"><strong>Subject:</strong> ${conversation.subject || "(no subject)"}</p>`;
        forwardBody += `</div>`;
        forwardBody += `<div style="margin-top: 20px;">`;
        forwardBody += message.htmlBody || message.body || "<p>(no content)</p>";
        forwardBody += `</div>`;
      }

      // Create raw email using MailComposer
      const mailComposer = new MailComposer({
        from: fromAddress,
        to,
        subject: `Fwd: ${conversation.subject || "(no subject)"}`,
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
      await sendGmailEmail(gmailService, rawEmail, null);
      successCount++;
    } catch (error) {
      captureExceptionAndLog(error, {
        extra: { slug, message: `Error forwarding conversation ${slug}` },
      });
      errorCount++;
    }
  }

  console.log(`Bulk forward completed: ${successCount} succeeded, ${errorCount} failed`);
};
