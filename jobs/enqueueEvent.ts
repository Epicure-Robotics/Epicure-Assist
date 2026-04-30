import { sql } from "drizzle-orm";
import superjson from "superjson";
import { assertDefined } from "@/components/utils/assert";
import type { DrizzleDb } from "@/db/createDbClient";
import { jobRuns } from "@/db/schema/jobRuns";
import { events, type EventData, type EventName } from "@/jobs/eventCatalog";

export type { EventData, EventName } from "@/jobs/eventCatalog";

export const enqueueEventWithDb = async <T extends EventName>(
  database: DrizzleDb,
  event: T,
  data: EventData<T>,
  { sleepSeconds = 0 }: { sleepSeconds?: number } = {},
) => {
  console.log(`[triggerEvent] Starting event: ${event}`);
  console.log(`[triggerEvent] Event data:`, JSON.stringify(data, null, 2));
  console.log(`[triggerEvent] Sleep seconds: ${sleepSeconds}`);
  console.log(`[triggerEvent] Jobs to trigger:`, events[event].jobs);

  await database.transaction(async (tx) => {
    console.log(`[triggerEvent] Starting database transaction`);

    const runs = await tx
      .insert(jobRuns)
      .values(
        events[event].jobs.map((job) => ({
          job,
          event,
          data,
        })),
      )
      .returning();

    console.log(
      `[triggerEvent] Created ${runs.length} job runs:`,
      runs.map((r) => ({ id: r.id, job: r.job })),
    );

    const payloads = events[event].jobs.map((job) => ({
      event,
      job,
      data: superjson.serialize(data),
      jobRunId: assertDefined(runs.find((run) => run.job === job)).id,
    }));

    console.log(`[triggerEvent] Prepared ${payloads.length} payloads for pgmq`);
    console.log(`[triggerEvent] Payloads:`, JSON.stringify(payloads, null, 2));

    console.log(`[triggerEvent] Executing pgmq.send_batch with explicit type casts`);
    await tx.execute(
      sql`SELECT pgmq.send_batch('jobs'::text, ARRAY[${sql.join(payloads, sql`,`)}]::jsonb[], ${sleepSeconds}::integer)`,
    );

    console.log(`[triggerEvent] Successfully sent batch to pgmq`);
  });

  console.log(`[triggerEvent] Transaction completed for event: ${event}`);
};
