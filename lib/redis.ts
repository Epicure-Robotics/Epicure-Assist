import { createClient, type RedisClientType } from "redis";
import { env } from "@/lib/env";
import { captureExceptionAndLog } from "@/lib/shared/sentry";

let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType | null> | null = null;

export async function getRedis(): Promise<RedisClientType | null> {
  const url = env.REDIS_URL;
  if (!url) return null;

  if (client?.isOpen) return client;

  if (!connectPromise) {
    connectPromise = (async () => {
      try {
        const redis = createClient({ url });
        redis.on("error", (error) => captureExceptionAndLog(error));
        await redis.connect();
        client = redis;
        return client;
      } catch (error) {
        captureExceptionAndLog(error);
        return null;
      }
    })();
  }

  return connectPromise;
}
