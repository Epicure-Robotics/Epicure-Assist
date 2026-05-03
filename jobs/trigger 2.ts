import { db } from "@/db/client";
import { enqueueEventWithDb, type EventData, type EventName } from "@/jobs/enqueueEvent";

export type { EventData, EventName };

export const triggerEvent = <T extends EventName>(
  event: T,
  data: EventData<T>,
  { sleepSeconds = 0 }: { sleepSeconds?: number } = {},
) => enqueueEventWithDb(db, event, data, { sleepSeconds });
