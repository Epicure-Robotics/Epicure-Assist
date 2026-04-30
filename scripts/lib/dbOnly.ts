/**
 * Supabase Postgres URL + pool for maintenance scripts without loading @/lib/env (OpenAI, etc.).
 * Uses POSTGRES_URL or DATABASE_URL from your Supabase project, or local `pnpm supabase start` defaults.
 */
/* eslint-disable no-restricted-properties -- intentional raw env reads; using @/lib/env would defeat the purpose */
import { resolve } from "node:path";
import { config } from "dotenv";
import { createDbClientWithPool } from "@/db/createDbClient";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env.development.local") });
config({ path: resolve(process.cwd(), ".env") });

function postgresUrlFromEnv(): string {
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (url) return url;
  const port = process.env.LOCAL_SUPABASE_DB_PORT ?? "54322";
  return `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
}

const { db: scriptDb, pool: scriptPool } = createDbClientWithPool(postgresUrlFromEnv(), { max: 5 });

export { scriptDb, scriptPool };
