import { env } from "@/lib/env";

/**
 * Epicure deployment tier (set explicitly; does not replace Supabase or Gmail wiring).
 * Use a separate Supabase project + `POSTGRES_URL` and Gmail OAuth per Vercel/environment for isolation.
 */
export function getEpicureDeployment(): "local" | "preview" | "production" {
  return env.EPICURE_DEPLOYMENT;
}

/**
 * Inbox that receives website form fan-out in this environment.
 * Must match the address of the Gmail account connected under Settings → Integrations.
 * Optional: if unset, form detection still uses the live `gmail_support_emails` row only.
 */
export function getEpicurePrimarySupportEmail(): string | undefined {
  return env.EPICURE_PRIMARY_SUPPORT_EMAIL;
}
