import { and, cosineDistance, gt, isNull, sql, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { knowledgeGaps } from "@/db/schema/knowledgeGaps";
import { generateEmbedding } from "@/lib/ai";

const DEDUP_SIMILARITY_THRESHOLD = 0.85;

export const logKnowledgeGap = async ({ query }: { query: string }) => {
  const embedding = await generateEmbedding(query, "embedding-query-similar-pages");
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
      query,
      embedding,
      lastSeenAt: new Date(),
    })
    .returning();

  return { action: "created", id: newGap!.id };
};
