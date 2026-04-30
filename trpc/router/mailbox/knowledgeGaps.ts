import { TRPCRouterRecord } from "@trpc/server";
import { and, desc, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { knowledgeGaps } from "@/db/schema/knowledgeGaps";
import { mailboxProcedure } from "./procedure";

export const knowledgeGapsRouter = {
  list: mailboxProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input }) => {
      return await db
        .select({
          id: knowledgeGaps.id,
          query: knowledgeGaps.query,
          count: knowledgeGaps.count,
          lastSeenAt: knowledgeGaps.lastSeenAt,
          createdAt: knowledgeGaps.createdAt,
        })
        .from(knowledgeGaps)
        .where(isNull(knowledgeGaps.resolvedAt))
        .orderBy(desc(knowledgeGaps.count), desc(knowledgeGaps.lastSeenAt))
        .limit(input.limit);
    }),

  resolve: mailboxProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db
      .update(knowledgeGaps)
      .set({ resolvedAt: new Date() })
      .where(and(sql`${knowledgeGaps.id} = ${input.id}`, isNull(knowledgeGaps.resolvedAt)));
  }),
} satisfies TRPCRouterRecord;
