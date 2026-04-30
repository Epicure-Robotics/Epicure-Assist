/**
 * Legacy job: subscription expiry emails for an external app user DB.
 * Epicure Inbox does not use this; export kept so callers import without error.
 */
export const sendSubscriptionExpirationReminders = async () => {
  console.log(
    "[sendSubscriptionExpirationReminders] Not used for Epicure Inbox (no external subscription DB); skipping.",
  );
};
