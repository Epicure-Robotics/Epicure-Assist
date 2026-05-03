import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { conversations } from "@/db/schema/conversations";
import { issueSubgroups } from "@/db/schema/issueSubgroups";
import { cosineSimilarity } from "@/lib/ai/issueSubgroups";

const LOW_VOLUME_THRESHOLD = 2;
const STRONG_MERGE_SIMILARITY = 0.92;

type SubgroupWithUsage = {
  id: number;
  issueGroupId: number;
  title: string;
  embedding: number[] | null;
  isArchived: boolean;
  createdBy: "ai" | "system_merge";
  usageCount: number;
};

export const cleanupIssueSubgroups = async () => {
  const subgroupUsage = await db
    .select({
      id: issueSubgroups.id,
      issueGroupId: issueSubgroups.issueGroupId,
      title: issueSubgroups.title,
      embedding: issueSubgroups.embedding,
      isArchived: issueSubgroups.isArchived,
      createdBy: issueSubgroups.createdBy,
      usageCount: sql<number>`COUNT(${conversations.id})::int`,
    })
    .from(issueSubgroups)
    .leftJoin(conversations, eq(conversations.issueSubgroupId, issueSubgroups.id))
    .where(and(eq(issueSubgroups.isArchived, false), eq(issueSubgroups.createdBy, "ai")))
    .groupBy(
      issueSubgroups.id,
      issueSubgroups.issueGroupId,
      issueSubgroups.title,
      issueSubgroups.embedding,
      issueSubgroups.isArchived,
      issueSubgroups.createdBy,
    )
    .orderBy(desc(issueSubgroups.issueGroupId), desc(sql`COUNT(${conversations.id})::int`));

  const byIssueGroup = subgroupUsage.reduce<Map<number, SubgroupWithUsage[]>>((acc, row) => {
    const current = acc.get(row.issueGroupId) ?? [];
    current.push(row);
    acc.set(row.issueGroupId, current);
    return acc;
  }, new Map());

  let mergedCount = 0;
  const actions: string[] = [];

  for (const siblings of byIssueGroup.values()) {
    const sorted = siblings.sort((a, b) => b.usageCount - a.usageCount);

    for (const subgroup of sorted) {
      if (subgroup.usageCount > LOW_VOLUME_THRESHOLD || !subgroup.embedding) continue;

      const candidates = sorted.filter(
        (candidate) =>
          candidate.id !== subgroup.id &&
          !!candidate.embedding &&
          candidate.usageCount > subgroup.usageCount &&
          !candidate.isArchived,
      );

      const best = candidates
        .map((candidate) => ({
          candidate,
          similarity: cosineSimilarity(subgroup.embedding!, candidate.embedding!),
        }))
        .sort((a, b) => b.similarity - a.similarity)[0];

      if (!best || best.similarity < STRONG_MERGE_SIMILARITY) continue;

      await db.transaction(async (tx) => {
        await tx
          .update(conversations)
          .set({ issueSubgroupId: best.candidate.id })
          .where(eq(conversations.issueSubgroupId, subgroup.id));

        await tx
          .update(issueSubgroups)
          .set({
            isArchived: true,
            updatedAt: new Date(),
          })
          .where(eq(issueSubgroups.id, subgroup.id));
      });

      mergedCount++;
      actions.push(
        `Merged low-volume subgroup "${subgroup.title}" (${subgroup.id}) into "${best.candidate.title}" (${best.candidate.id})`,
      );
    }
  }

  return {
    message: "Issue subgroup cleanup complete",
    mergedCount,
    actions,
  };
};
