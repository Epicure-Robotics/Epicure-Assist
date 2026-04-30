import { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle, NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { PgTransaction } from "drizzle-orm/pg-core";
import { Pool, PoolConfig } from "pg";
import * as schema from "@/db/schema";
import * as authSchema from "@/db/supabaseSchema/auth";

const fullSchema = { ...schema, ...authSchema };

export type CreateDbClientOptions = PoolConfig & { drizzleLogger?: boolean };

export const createDbClientWithPool = (url: string, options: CreateDbClientOptions = {}) => {
  const { drizzleLogger, ...poolOptions } = options;
  // https://github.com/brianc/node-postgres/issues/2558
  const urlWithoutVerification = url.replace("?sslmode=require", "?sslmode=no-verify");

  const poolConfig: PoolConfig = {
    connectionString: urlWithoutVerification,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ...poolOptions,
  };

  const pool = new Pool(poolConfig);

  pool.on("connect", (client) => {
    client.query("SET statement_timeout = 30000").catch((err) => {
      console.error("Error setting statement_timeout:", err);
    });
  });

  const db = drizzle({
    client: pool,
    schema: fullSchema,
    casing: "snake_case",
    logger: !!drizzleLogger,
  });

  return { db, pool };
};

export const createDbClient = (url: string, options: CreateDbClientOptions = {}) =>
  createDbClientWithPool(url, options).db;

export type DrizzleDb = ReturnType<typeof createDbClient>;

export type Transaction = PgTransaction<
  NodePgQueryResultHKT,
  typeof fullSchema,
  ExtractTablesWithRelations<typeof fullSchema>
>;
