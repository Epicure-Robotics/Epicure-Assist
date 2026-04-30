import { relations } from "drizzle-orm";
import { bigint, boolean, index, pgTable, text } from "drizzle-orm/pg-core";
import { withTimestamps } from "../lib/with-timestamps";
import { issueGroups } from "./issueGroups";
import { savedReplies } from "./savedReplies";

export const issueGroupConditions = pgTable(
  "issue_group_conditions",
  {
    ...withTimestamps,
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    issueGroupId: bigint("issue_group_id", { mode: "number" })
      .notNull()
      .references(() => issueGroups.id, { onDelete: "cascade" }),
    savedReplyId: bigint("saved_reply_id", { mode: "number" })
      .notNull()
      .references(() => savedReplies.id, { onDelete: "cascade" }),
    condition: text().notNull(), // AI-evaluated condition (plain English)
    isActive: boolean().notNull().default(true),
  },
  (table) => [
    index("issue_group_conditions_issue_group_id_idx").on(table.issueGroupId),
    index("issue_group_conditions_saved_reply_id_idx").on(table.savedReplyId),
  ],
).enableRLS();

export type IssueGroupCondition = typeof issueGroupConditions.$inferSelect;

export const issueGroupConditionsRelations = relations(issueGroupConditions, ({ one }) => ({
  issueGroup: one(issueGroups, {
    fields: [issueGroupConditions.issueGroupId],
    references: [issueGroups.id],
  }),
  savedReply: one(savedReplies, {
    fields: [issueGroupConditions.savedReplyId],
    references: [savedReplies.id],
  }),
}));
