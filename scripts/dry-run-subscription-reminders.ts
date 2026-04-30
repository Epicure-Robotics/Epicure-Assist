#!/usr/bin/env tsx
/**
 * Legacy dry-run for Pocket app subscription reminders.
 * Epicure Inbox does not use an external subscription DB; the job is a no-op.
 */
async function main() {
  console.log("Subscription expiration reminders are not used for Epicure Inbox.");
  console.log("See jobs/sendSubscriptionExpirationReminders.ts (no-op stub).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
