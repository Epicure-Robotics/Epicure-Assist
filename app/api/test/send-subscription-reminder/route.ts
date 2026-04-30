import { render } from "@react-email/render";
import { NextRequest, NextResponse } from "next/server";
import MailComposer from "nodemailer/lib/mail-composer";
import { db } from "@/db/client";
import { getGmailSupportEmail } from "@/lib/data/gmailSupportEmail";
import SubscriptionExpirationReminderEmail from "@/lib/emails/subscriptionExpirationReminder";
import { getGmailService, sendGmailEmail } from "@/lib/gmail/client";
import { formatGmailFromAddress } from "@/lib/gmail/format";
import { captureExceptionAndLog } from "@/lib/shared/sentry";

export const maxDuration = 30;

/**
 * Test endpoint to send subscription reminder email
 * Usage: POST /api/test/send-subscription-reminder
 * Body: { "email": "test@example.com" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const emailTo = body.email || "imsonibharat@gmail.com";

    console.log(`[Test] Sending subscription reminder email to: ${emailTo}`);

    // Get Gmail credentials
    const mailbox = await db.query.mailboxes.findFirst({
      orderBy: (mailboxes, { asc }) => [asc(mailboxes.id)],
    });

    if (!mailbox) {
      return NextResponse.json({ error: "No mailbox found" }, { status: 500 });
    }

    const gmailSupportEmail = await getGmailSupportEmail(mailbox);
    if (!gmailSupportEmail) {
      return NextResponse.json({ error: "Gmail not connected for mailbox" }, { status: 500 });
    }
    const fromAddress = formatGmailFromAddress(gmailSupportEmail.email, mailbox.name);

    // Prepare test data
    const testData = {
      displayName: "Test User",
      email: emailTo,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
    };

    // Render email
    const emailHtml = await render(SubscriptionExpirationReminderEmail(testData));

    // Create raw email
    const mailComposer = new MailComposer({
      from: fromAddress,
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

    // Send email
    const gmailService = getGmailService(gmailSupportEmail);
    await sendGmailEmail(gmailService, rawEmail, null);

    console.log(`[Test] Email sent successfully to: ${emailTo}`);

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${emailTo}`,
      from: fromAddress,
      expiresAt: testData.expiresAt,
    });
  } catch (error) {
    captureExceptionAndLog(error);
    console.error("[Test] Error sending email:", error);
    return NextResponse.json(
      {
        error: "Failed to send test email",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
