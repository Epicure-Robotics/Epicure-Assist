import { render } from "@react-email/render";
import { sql } from "drizzle-orm";
import MailComposer from "nodemailer/lib/mail-composer";
import { Client } from "pg";
import { db } from "@/db/client";
import { conversations } from "@/db/schema";
import { getGmailSupportEmail } from "@/lib/data/gmailSupportEmail";
import SubscriptionExpirationReminderEmail from "@/lib/emails/subscriptionExpirationReminder";
import { env } from "@/lib/env";
import { getGmailService, sendGmailEmail } from "@/lib/gmail/client";
import { formatGmailFromAddress } from "@/lib/gmail/format";
import { isPocketConfigured } from "@/lib/pocket/client";
import { captureExceptionAndLog } from "@/lib/shared/sentry";

const POCKET_QUERY_TIMEOUT_MS = 30000; // 30 seconds

interface ExpiringSubscription {
  user_id: string;
  user_email: string;
  display_name: string | null;
  plan: string;
  expires_at: Date;
}

/**
 * Query Pocket database for subscriptions expiring in 24 hours
 */
async function getExpiringSubscriptions(): Promise<ExpiringSubscription[]> {
  if (!isPocketConfigured()) {
    console.log("[sendSubscriptionExpirationReminders] Pocket database not configured, skipping");
    return [];
  }

  const client = new Client({
    connectionString: env.POCKET_DB_URL,
    connectionTimeoutMillis: POCKET_QUERY_TIMEOUT_MS,
    query_timeout: POCKET_QUERY_TIMEOUT_MS,
  });

  try {
    await client.connect();

    const query = `
      SELECT
        u.id as user_id,
        u.email as user_email,
        u.display_name,
        s.plan,
        s.expires_at
      FROM subscriptions s
      INNER JOIN users u ON s.user_id = u.id
      WHERE s.trial_period IS TRUE
        AND s.plan = 'pro'
        AND s.expires_at > NOW()
        AND s.expires_at <= NOW() + INTERVAL '24 hours'
      ORDER BY s.expires_at ASC
    `;

    const result = await client.query<ExpiringSubscription>(query);

    console.log(`[sendSubscriptionExpirationReminders] Found ${result.rows.length} expiring subscriptions`);

    return result.rows;
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        operation: "getExpiringSubscriptions",
      },
    });

    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        throw new Error("Pocket database query timed out");
      } else if (error.message.includes("connect")) {
        throw new Error("Failed to connect to Pocket database");
      } else if (error.message.includes("relation") && error.message.includes("does not exist")) {
        throw new Error("Subscriptions or users table not found in Pocket database");
      }
    }

    throw new Error("Failed to query expiring subscriptions from Pocket database");
  } finally {
    await client.end();
  }
}

/**
 * Filter subscriptions to only include emails that exist in our mailbox conversations
 */
async function filterSubscriptionsByMailbox(subscriptions: ExpiringSubscription[]): Promise<ExpiringSubscription[]> {
  if (subscriptions.length === 0) {
    return [];
  }

  try {
    // Get all unique emails from expiring subscriptions
    const emails = subscriptions.map((s) => s.user_email);

    // Query conversations to find which emails exist in our system (case-insensitive match)
    const existingEmails = await db
      .selectDistinct({ emailFrom: conversations.emailFrom })
      .from(conversations)
      .where(
        sql`LOWER(${conversations.emailFrom}) IN (${sql.join(
          emails.map((e) => sql`LOWER(${e})`),
          sql`, `,
        )})`,
      );

    const existingEmailsSet = new Set(
      existingEmails.map((c) => c.emailFrom?.toLowerCase()).filter((e): e is string => e !== null && e !== undefined),
    );

    // Filter subscriptions to only those with emails in our mailbox
    const filtered = subscriptions.filter((sub) => existingEmailsSet.has(sub.user_email.toLowerCase()));

    console.log(
      `[sendSubscriptionExpirationReminders] Filtered ${subscriptions.length} subscriptions to ${filtered.length} that exist in mailbox`,
    );

    return filtered;
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        operation: "filterSubscriptionsByMailbox",
        subscriptionCount: subscriptions.length,
      },
    });

    // If filtering fails, return empty array to be safe
    console.error("[sendSubscriptionExpirationReminders] Failed to filter subscriptions, skipping all");
    return [];
  }
}

/**
 * Send expiration reminder email to a user using Gmail API
 */
async function sendReminderEmail(
  subscription: ExpiringSubscription,
  gmailSupportEmail: NonNullable<Awaited<ReturnType<typeof getGmailSupportEmail>>>,
  fromAddress: string,
): Promise<{ success: boolean; error?: unknown }> {
  try {
    // Render React email component to HTML
    const emailHtml = await render(
      SubscriptionExpirationReminderEmail({
        displayName: subscription.display_name,
        email: subscription.user_email,
        expiresAt: subscription.expires_at.toISOString(),
      }),
    );

    // Create raw email using MailComposer
    const mailComposer = new MailComposer({
      from: fromAddress,
      to: [subscription.user_email],
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

    // Send via Gmail API
    const gmailService = getGmailService(gmailSupportEmail);
    await sendGmailEmail(gmailService, rawEmail, null);

    console.log(
      `[sendSubscriptionExpirationReminders] Sent reminder to ${subscription.user_email} (expires: ${subscription.expires_at.toISOString()})`,
    );

    return { success: true };
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        userId: subscription.user_id,
        userEmail: subscription.user_email,
        operation: "sendReminderEmail",
      },
    });

    return { success: false, error };
  }
}

/**
 * Job to send subscription expiration reminders
 * Runs once per day to find and notify users whose Pro trial expires in 24 hours
 */
export const sendSubscriptionExpirationReminders = async () => {
  try {
    console.log("[sendSubscriptionExpirationReminders] Starting job");

    if (!isPocketConfigured()) {
      console.log("[sendSubscriptionExpirationReminders] Pocket database not configured, skipping");
      return {
        skipped: true,
        reason: "Pocket database not configured",
      };
    }

    // Get default mailbox and Gmail credentials
    const mailbox = await db.query.mailboxes.findFirst({
      orderBy: (mailboxes, { asc }) => [asc(mailboxes.id)],
    });

    if (!mailbox) {
      console.log("[sendSubscriptionExpirationReminders] No mailbox found, skipping");
      return {
        skipped: true,
        reason: "No mailbox configured",
      };
    }

    const gmailSupportEmail = await getGmailSupportEmail(mailbox);
    if (!gmailSupportEmail) {
      console.log("[sendSubscriptionExpirationReminders] Gmail not connected for mailbox, skipping");
      return {
        skipped: true,
        reason: "Gmail not connected",
      };
    }
    const fromAddress = formatGmailFromAddress(gmailSupportEmail.email, mailbox.name);

    // Get expiring subscriptions from Pocket database
    const expiringSubscriptions = await getExpiringSubscriptions();

    if (expiringSubscriptions.length === 0) {
      console.log("[sendSubscriptionExpirationReminders] No expiring subscriptions found in Pocket");
      return {
        totalSubscriptions: 0,
        mailboxFiltered: 0,
        duplicateFiltered: 0,
        emailsSent: 0,
        emailsFailed: 0,
      };
    }

    // Filter to only users who have conversations in our mailbox
    const mailboxFilteredSubscriptions = await filterSubscriptionsByMailbox(expiringSubscriptions);

    if (mailboxFilteredSubscriptions.length === 0) {
      console.log("[sendSubscriptionExpirationReminders] No expiring subscriptions match mailbox customers");
      return {
        totalSubscriptions: expiringSubscriptions.length,
        mailboxFiltered: 0,
        duplicateFiltered: 0,
        emailsSent: 0,
        emailsFailed: 0,
      };
    }

    // Send reminder emails
    const emailPromises = mailboxFilteredSubscriptions.map((subscription) =>
      sendReminderEmail(subscription, gmailSupportEmail, fromAddress),
    );
    const emailResults = await Promise.all(emailPromises);

    const emailsSent = emailResults.filter((r) => r.success).length;
    const emailsFailed = emailResults.filter((r) => !r.success).length;

    console.log(
      `[sendSubscriptionExpirationReminders] Completed: ${emailsSent} sent, ${emailsFailed} failed out of ${mailboxFilteredSubscriptions.length} mailbox-matched subscriptions (${expiringSubscriptions.length} total)`,
    );

    return {
      totalSubscriptions: expiringSubscriptions.length,
      mailboxFiltered: mailboxFilteredSubscriptions.length,
      duplicateFiltered: mailboxFilteredSubscriptions.length,
      emailsSent,
      emailsFailed,
      results: emailResults,
    };
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        operation: "sendSubscriptionExpirationReminders",
      },
    });
    throw error;
  }
};
