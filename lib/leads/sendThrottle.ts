import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { conversationMessages } from "@/db/schema/conversationMessages";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";

const MAX_SENDS_PER_HOUR = 30;

/**
 * Per-tenant cap on outbound Gmail posts. Uses recent sent staff messages as a proxy counter.
 */
export const assertWithinSendThrottle = async (tenantId: number = DEFAULT_TENANT_ID): Promise<void> => {
  void tenantId;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.role, "staff"),
        eq(conversationMessages.status, "sent"),
        gte(conversationMessages.createdAt, oneHourAgo),
      ),
    );

  const count = rows[0]?.count ?? 0;

  if (count >= MAX_SENDS_PER_HOUR) {
    throw new Error(`Send rate limit reached: max ${MAX_SENDS_PER_HOUR} outbound emails per hour. Try again later.`);
  }
};
