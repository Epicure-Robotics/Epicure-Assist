#!/usr/bin/env tsx
/**
 * Dry run script for subscription expiration reminders
 * Tests the job logic without actually sending emails
 */
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { db } from "@/db/client";
import { conversations } from "@/db/schema";
import { getGmailSupportEmail } from "@/lib/data/gmailSupportEmail";
import { env } from "@/lib/env";
import { isPocketConfigured } from "@/lib/pocket/client";

const POCKET_QUERY_TIMEOUT_MS = 30000; // 30 seconds

interface ExpiringSubscription {
  user_id: string;
  user_email: string;
  display_name: string | null;
  plan: string;
  expires_at: Date;
}

async function getExpiringSubscriptions(): Promise<ExpiringSubscription[]> {
  if (!isPocketConfigured()) {
    console.log("❌ Pocket database not configured");
    console.log("   Set POCKET_DB_URL environment variable");
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
    return result.rows;
  } finally {
    await client.end();
  }
}

async function filterSubscriptionsByMailbox(subscriptions: ExpiringSubscription[]): Promise<ExpiringSubscription[]> {
  if (subscriptions.length === 0) {
    return [];
  }

  const emails = subscriptions.map((s) => s.user_email);

  // Get unique emails from conversations that match our subscription emails (case-insensitive)
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

  return subscriptions.filter((sub) => existingEmailsSet.has(sub.user_email.toLowerCase()));
}

async function main() {
  console.log("🔍 Subscription Expiration Reminder - DRY RUN");
  console.log("=".repeat(60));
  console.log();

  // Check Pocket configuration
  console.log("📋 Step 1: Checking Pocket database configuration...");
  if (!isPocketConfigured()) {
    console.log("❌ FAILED: POCKET_DB_URL not configured");
    process.exit(1);
  }
  console.log("✅ Pocket database configured");
  console.log();

  // Check mailbox and Gmail configuration
  console.log("📋 Step 2: Checking mailbox and Gmail configuration...");
  const mailbox = await db.query.mailboxes.findFirst({
    orderBy: (mailboxes, { asc }) => [asc(mailboxes.id)],
  });

  if (!mailbox) {
    console.log("❌ FAILED: No mailbox found");
    process.exit(1);
  }
  console.log(`✅ Mailbox found: ID ${mailbox.id}`);

  const gmailSupportEmail = await getGmailSupportEmail(mailbox);
  if (!gmailSupportEmail) {
    console.log("❌ FAILED: Gmail not connected for mailbox");
    process.exit(1);
  }
  console.log(`✅ Gmail connected: ${gmailSupportEmail.email}`);
  console.log();

  // Get expiring subscriptions
  console.log("📋 Step 3: Querying Pocket for expiring subscriptions...");
  const expiringSubscriptions = await getExpiringSubscriptions();

  if (expiringSubscriptions.length === 0) {
    console.log("ℹ️  No expiring subscriptions found in Pocket database");
    console.log();
    console.log("💡 To test with mock data, modify the SQL query in the script");
    process.exit(0);
  }

  console.log(`✅ Found ${expiringSubscriptions.length} expiring subscription(s):`);
  expiringSubscriptions.forEach((sub, idx) => {
    console.log(`   ${idx + 1}. ${sub.display_name || sub.user_email}`);
    console.log(`      Email: ${sub.user_email}`);
    console.log(`      Expires: ${sub.expires_at.toISOString()}`);
  });
  console.log();

  // Filter by mailbox
  console.log("📋 Step 4: Filtering by mailbox conversations...");
  const filteredSubscriptions = await filterSubscriptionsByMailbox(expiringSubscriptions);

  if (filteredSubscriptions.length === 0) {
    console.log("⚠️  No subscriptions match customers in mailbox");
    console.log(`   ${expiringSubscriptions.length} subscription(s) found, but none have conversations`);
    process.exit(0);
  }

  console.log(`✅ ${filteredSubscriptions.length} subscription(s) match mailbox customers:`);
  filteredSubscriptions.forEach((sub, idx) => {
    console.log(`   ${idx + 1}. ${sub.display_name || sub.user_email} (${sub.user_email})`);
  });
  console.log();

  // Show what would be sent
  console.log("📋 Step 5: Emails that would be sent:");
  console.log("─".repeat(60));
  filteredSubscriptions.forEach((sub, idx) => {
    console.log();
    console.log(`📧 Email #${idx + 1}`);
    console.log(`   To: ${sub.user_email}`);
    console.log(`   From: ${gmailSupportEmail.email}`);
    console.log(`   Subject: Action Required: Cancel Your Store Subscription to Avoid Double Charges`);
    console.log(`   User: ${sub.display_name || "N/A"}`);
    console.log(
      `   Expires: ${new Date(sub.expires_at).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`,
    );
  });
  console.log();
  console.log("─".repeat(60));
  console.log();

  // Summary
  console.log("📊 Summary:");
  console.log(`   Total expiring subscriptions: ${expiringSubscriptions.length}`);
  console.log(`   Filtered (in mailbox): ${filteredSubscriptions.length}`);
  console.log(`   Would send: ${filteredSubscriptions.length} email(s)`);
  console.log();
  console.log("✅ DRY RUN COMPLETE - No emails were sent");
  console.log();
  console.log("💡 To run the actual job:");
  console.log("   pnpm tsx -r tsconfig-paths/register jobs/sendSubscriptionExpirationReminders.ts");
}

main().catch((error) => {
  console.error();
  console.error("❌ Error during dry run:");
  console.error(error);
  process.exit(1);
});
