import { relations } from "drizzle-orm";
import { bigint, boolean, index, pgTable, text, uniqueIndex, vector } from "drizzle-orm/pg-core";
import { withTimestamps } from "../lib/with-timestamps";
import { conversations } from "./conversations";
import { issueGroups } from "./issueGroups";

export const issueSubgroups = pgTable(
  "issue_subgroups",
  {
    ...withTimestamps,
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    issueGroupId: bigint({ mode: "number" })
      .notNull()
      .references(() => issueGroups.id, { onDelete: "cascade" }),
    title: text().notNull(),
    normalizedTitle: text().notNull(),
    description: text(),
    embedding: vector({ dimensions: 1536 }),
    isArchived: boolean().notNull().default(false),
    createdBy: text().$type<"ai" | "system_merge">().notNull().default("ai"),
  },
  (table) => [
    uniqueIndex("issue_subgroups_issue_group_id_normalized_title_unique").on(table.issueGroupId, table.normalizedTitle),
    index("issue_subgroups_issue_group_id_created_at_idx").on(table.issueGroupId, table.createdAt),
    index("issue_subgroups_issue_group_id_idx").on(table.issueGroupId),
    index("issue_subgroups_embedding_idx").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
  ],
).enableRLS();

export const issueSubgroupsRelations = relations(issueSubgroups, ({ one, many }) => ({
  issueGroup: one(issueGroups, {
    fields: [issueSubgroups.issueGroupId],
    references: [issueGroups.id],
  }),
  conversations: many(conversations),
}));

export type IssueSubgroup = typeof issueSubgroups.$inferSelect;
