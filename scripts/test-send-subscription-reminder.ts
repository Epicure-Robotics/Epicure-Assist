#!/usr/bin/env tsx
/**
 * Test script to send subscription reminder email to a specific email address
 * Usage: pnpm with-dev-env tsx scripts/test-send-subscription-reminder.ts <email>
 */
import { render } from "@react-email/render";
import MailComposer from "nodemailer/lib/mail-composer";
import { db } from "@/db/client";
import { getGmailSupportEmail } from "@/lib/data/gmailSupportEmail";
import SubscriptionExpirationReminderEmail from "@/lib/emails/subscriptionExpirationReminder";
import { getGmailService, sendGmailEmail } from "@/lib/gmail/client";

async function main() {
  const emailTo = process.argv[2] || "imsonibharat@gmail.com";

  console.log("📧 Subscription Reminder Email Test");
  console.log("=".repeat(60));
  console.log();

  // Get Gmail credentials
  console.log("📋 Step 1: Getting Gmail configuration...");
  const mailbox = await db.query.mailboxes.findFirst({
    orderBy: (mailboxes, { asc }) => [asc(mailboxes.id)],
  });

  if (!mailbox) {
    console.error("❌ No mailbox found");
    process.exit(1);
  }

  const gmailSupportEmail = await getGmailSupportEmail(mailbox);
  if (!gmailSupportEmail) {
    console.error("❌ Gmail not connected for mailbox");
    process.exit(1);
  }

  console.log(`✅ Gmail connected: ${gmailSupportEmail.email}`);
  console.log();

  // Prepare test data
  console.log("📋 Step 2: Preparing test email...");
  const testData = {
    displayName: "Test User",
    email: emailTo,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
  };

  console.log(`   To: ${testData.email}`);
  console.log(`   From: ${gmailSupportEmail.email}`);
  console.log(`   Expires: ${new Date(testData.expiresAt).toLocaleString()}`);
  console.log();

  // Render email
  console.log("📋 Step 3: Rendering email template...");
  const emailHtml = await render(SubscriptionExpirationReminderEmail(testData), { pretty: true });
  console.log("✅ Email rendered successfully");
  console.log();

  // Create raw email
  console.log("📋 Step 4: Creating email message...");
  const mailComposer = new MailComposer({
    from: gmailSupportEmail.email,
    to: [testData.email],
    subject: "Action Required: Cancel Your Store Subscription to Avoid Double Charges",
    html: emailHtml,
    textEncoding: "base64",
  });

  const rawEmail = await new Promise<string>((resolve, reject) => {
    mailComposer.compile().build((err, message) => {
      if (err) reject(err);
      else resolve(Buffer.from(message).toString("base64url"));
    });
  });
  console.log("✅ Email message created");
  console.log();

  // Send email
  console.log("📋 Step 5: Sending email via Gmail API...");
  const gmailService = getGmailService(gmailSupportEmail);
  await sendGmailEmail(gmailService, rawEmail, null);

  console.log("✅ Email sent successfully!");
  console.log();
  console.log("─".repeat(60));
  console.log(`📬 Check ${emailTo} for the test email`);
  console.log();
}

main().catch((error) => {
  console.error();
  console.error("❌ Error sending test email:");
  console.error(error);
  process.exit(1);
});

export {};
