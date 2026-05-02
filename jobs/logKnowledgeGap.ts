import { and, cosineDistance, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { knowledgeGaps } from "@/db/schema/knowledgeGaps";
import { generateEmbedding } from "@/lib/ai";
import { plainTextFromPossibleHtml } from "@/lib/shared/plainTextFromPossibleHtml";

const DEDUP_SIMILARITY_THRESHOLD = 0.85;

export const logKnowledgeGap = async ({ query }: { query: string }) => {
  const plainQuery = plainTextFromPossibleHtml(query);
  if (!plainQuery) {
    return { action: "skipped" as const, reason: "empty_after_normalization" };
  }

  const embedding = await generateEmbedding(plainQuery, "embedding-query-similar-pages");
  const similarity = sql<number>`1 - (${cosineDistance(knowledgeGaps.embedding, embedding)})`;

  const existing = await db.query.knowledgeGaps.findFirst({
    where: and(gt(similarity, DEDUP_SIMILARITY_THRESHOLD), isNull(knowledgeGaps.resolvedAt)),
    extras: { similarity: similarity.as("similarity") },
    orderBy: (_t, { desc }) => [desc(similarity)],
  });

  if (existing) {
    await db
      .update(knowledgeGaps)
      .set({
        count: sql`${knowledgeGaps.count} + 1`,
        lastSeenAt: new Date(),
      })
      .where(eq(knowledgeGaps.id, existing.id));
    return { action: "incremented", id: existing.id };
  }

  const [newGap] = await db
    .insert(knowledgeGaps)
    .values({
      query: plainQuery,
      embedding,
      lastSeenAt: new Date(),
    })
    .returning();

  return { action: "created", id: newGap!.id };
};
