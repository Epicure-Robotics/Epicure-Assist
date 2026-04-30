/**
 * Enqueues Gmail backlog import for website-style notification threads only.
 *
 * Uses Supabase Postgres + pgmq only (no OpenAI keys)—set POSTGRES_URL or DATABASE_URL for the same project the worker uses.
 *
 * Usage:
 *   pnpm import:epicure-website-leads [gmailSupportEmailId] [daysBack]
 *
 * If gmailSupportEmailId is omitted, uses the first row in gmail_support_emails (usually connect@).
 * Default daysBack: 90.
 */

import { subDays } from "date-fns";
import { enqueueEventWithDb } from "@/jobs/enqueueEvent";
import { EPICURE_WEBSITE_LEADS_GMAIL_QUERY_SUFFIX } from "@/lib/epicure/websiteLeadGmailQuery";
import { scriptDb, scriptPool } from "./lib/dbOnly";

async function main() {
  const argId = process.argv[2] ? Number(process.argv[2]) : NaN;
  const daysBack = process.argv[3] ? Number(process.argv[3]) : 90;

  const gmailSupportEmailId = Number.isFinite(argId)
    ? argId
    : (
        await scriptDb.query.gmailSupportEmails.findFirst({
          columns: { id: true, email: true },
          orderBy: (t, { asc }) => [asc(t.id)],
        })
      )?.id;

  if (gmailSupportEmailId == null || !Number.isFinite(gmailSupportEmailId)) {
    console.error("No gmailSupportEmailId passed and no gmail_support_emails row found.");
    process.exit(1);
  }

  const to = new Date();
  const from = subDays(to, Number.isFinite(daysBack) ? daysBack : 90);

  console.log("gmailSupportEmailId:", gmailSupportEmailId);
  console.log("fromInclusive:", from.toISOString());
  console.log("toInclusive:", to.toISOString());
  console.log("gmailQuerySuffix:", EPICURE_WEBSITE_LEADS_GMAIL_QUERY_SUFFIX);

  await enqueueEventWithDb(scriptDb, "gmail/import-gmail-threads", {
    gmailSupportEmailId,
    fromInclusive: from.toISOString(),
    toInclusive: to.toISOString(),
    gmailQuerySuffix: EPICURE_WEBSITE_LEADS_GMAIL_QUERY_SUFFIX,
  });

  console.log("Queued gmail/import-gmail-threads job batch.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => scriptPool.end());
