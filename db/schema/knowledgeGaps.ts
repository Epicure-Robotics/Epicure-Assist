import { bigint, index, integer, pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";
import { withTimestamps } from "../lib/with-timestamps";

export const knowledgeGaps = pgTable(
  "knowledge_gaps",
  {
    ...withTimestamps,
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    query: text().notNull(),
    count: integer().notNull().default(1),
    lastSeenAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    resolvedAt: timestamp({ withTimezone: true, mode: "date" }),
    embedding: vector({ dimensions: 1536 }),
  },
  (table) => [
    index("knowledge_gaps_created_at_idx").on(table.createdAt),
    index("knowledge_gaps_embedding_idx").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
  ],
);
