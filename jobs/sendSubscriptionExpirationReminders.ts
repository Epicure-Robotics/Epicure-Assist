/**
 * Legacy job: subscription expiry emails for an external app user DB.
 * Epicure Assist does not use this; export kept so callers import without error.
 */
export const sendSubscriptionExpirationReminders = async () => {
  console.log(
    "[sendSubscriptionExpirationReminders] Not used for Epicure Assist (no external subscription DB); skipping.",
  );
};
