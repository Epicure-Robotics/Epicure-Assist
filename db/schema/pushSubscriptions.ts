import { relations } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { withTimestamps } from "../lib/with-timestamps";
import { authUsers } from "../supabaseSchema/auth";
import { userProfiles } from "./userProfiles";

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    ...withTimestamps,
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    endpoint: text().notNull(),
    p256dh: text().notNull(), // Encryption key for push messages
    auth: text().notNull(), // Authentication secret for push messages
    userAgent: text("user_agent"), // Optional: track which device/browser
    lastUsedAt: timestamp({ withTimezone: true, mode: "date" }), // Track active subscriptions
  },
  (table) => [
    index("push_subscriptions_user_id_idx").on(table.userId),
    index("push_subscriptions_last_used_at_idx").on(table.lastUsedAt),
    unique("push_subscriptions_user_endpoint_unique").on(table.userId, table.endpoint),
  ],
).enableRLS();

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  userProfile: one(userProfiles, {
    fields: [pushSubscriptions.userId],
    references: [userProfiles.id],
  }),
  user: one(authUsers, {
    fields: [pushSubscriptions.userId],
    references: [authUsers.id],
  }),
}));
