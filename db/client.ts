import { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle, NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { PgTransaction } from "drizzle-orm/pg-core";
import { Pool, PoolConfig } from "pg";
import * as schema from "@/db/schema";
import * as authSchema from "@/db/supabaseSchema/auth";
import { env } from "@/lib/env";

const fullSchema = { ...schema, ...authSchema };

export const createDbClient = (url: string, options: PoolConfig = {}) => {
  // https://github.com/brianc/node-postgres/issues/2558
  const urlWithoutVerification = url.replace("?sslmode=require", "?sslmode=no-verify");
  
  // Optimized connection pool settings for better resource utilization
  // With 10 concurrent users and available headroom, we can increase pool size
  const poolConfig: PoolConfig = {
    connectionString: urlWithoutVerification,
    max: 20, // Increase from default 10 to better utilize available resources
    idleTimeoutMillis: 30000, // Keep connections warm for 30 seconds
    connectionTimeoutMillis: 5000, // Timeout connection attempts after 5 seconds
    ...options,
  };
  
  const pool = new Pool(poolConfig);
  
  // Set statement_timeout as a session parameter after connection is established
  pool.on('connect', (client) => {
    client.query('SET statement_timeout = 30000').catch((err) => {
      console.error('Error setting statement_timeout:', err);
    });
  });
  
  return drizzle({ client: pool, schema: fullSchema, casing: "snake_case", logger: !!env.DRIZZLE_LOGGING });
};

type DrizzleClientType = ReturnType<typeof createDbClient>;

declare global {
  // eslint-disable-next-line no-var
  var drizzleGlobal: DrizzleClientType | undefined;
}

const db = global.drizzleGlobal ?? createDbClient(env.POSTGRES_URL);

export { db };

if (env.NODE_ENV !== "production") global.drizzleGlobal = db;

export type Transaction = PgTransaction<
  NodePgQueryResultHKT,
  typeof fullSchema,
  ExtractTablesWithRelations<typeof fullSchema>
>;

export type TransactionOrDb = Transaction | typeof db;
