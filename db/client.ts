import { createDbClient, createDbClientWithPool, type DrizzleDb, type Transaction } from "@/db/createDbClient";
import { env } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var drizzleGlobal: DrizzleDb | undefined;
}

const db =
  global.drizzleGlobal ?? createDbClientWithPool(env.POSTGRES_URL, { drizzleLogger: !!env.DRIZZLE_LOGGING }).db;

export { createDbClient, db };
export type { DrizzleDb, Transaction };

if (env.NODE_ENV !== "production") global.drizzleGlobal = db;

export type TransactionOrDb = Transaction | typeof db;
