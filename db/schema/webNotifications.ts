import { relations } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { withTimestamps } from "../lib/with-timestamps";
import { authUsers } from "../supabaseSchema/auth";
import { conversationMessages } from "./conversationMessages";
import { conversations } from "./conversations";
import { notes } from "./notes";
import { userProfiles } from "./userProfiles";

export type WebNotificationType = "new_message" | "assignment_change" | "internal_note";

export const webNotifications = pgTable(
  "web_notifications",
  {
    ...withTimestamps,
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    conversationId: bigint("conversation_id", { mode: "number" }).notNull(),
    messageId: bigint("message_id", { mode: "number" }),
    noteId: bigint("note_id", { mode: "number" }),
    type: text().$type<WebNotificationType>().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    actionUrl: text("action_url").notNull(),
    sentAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
    readAt: timestamp({ withTimezone: true, mode: "date" }),
    deliveredAt: timestamp({ withTimezone: true, mode: "date" }), // When push notification was delivered
  },
  (table) => [
    index("web_notifications_user_id_idx").on(table.userId),
    index("web_notifications_conversation_id_idx").on(table.conversationId),
    index("web_notifications_user_sent_at_idx").on(table.userId, table.sentAt),
    index("web_notifications_read_at_idx").on(table.readAt),
  ],
).enableRLS();

export const webNotificationsRelations = relations(webNotifications, ({ one }) => ({
  userProfile: one(userProfiles, {
    fields: [webNotifications.userId],
    references: [userProfiles.id],
  }),
  user: one(authUsers, {
    fields: [webNotifications.userId],
    references: [authUsers.id],
  }),
  conversation: one(conversations, {
    fields: [webNotifications.conversationId],
    references: [conversations.id],
  }),
  message: one(conversationMessages, {
    fields: [webNotifications.messageId],
    references: [conversationMessages.id],
  }),
  note: one(notes, {
    fields: [webNotifications.noteId],
    references: [notes.id],
  }),
}));
