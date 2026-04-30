/**
 * Updates existing issue_groups + linked saved_replies to match lib/epicure/issueGroupSpecs.ts.
 * Does not insert new rows (use seed with EPICURE_SEED for first-time setup).
 *
 * Uses Supabase Postgres only (no full app env)—set POSTGRES_URL or DATABASE_URL for the target project, or local Supabase port.
 *
 * Usage: pnpm sync:epicure-issue-groups
 */

import { eq } from "drizzle-orm";
import { issueGroups, savedReplies } from "@/db/schema";
import { EPICURE_ISSUE_GROUP_SPECS } from "@/lib/epicure/issueGroupSpecs";
import { scriptDb, scriptPool } from "./lib/dbOnly";

async function main() {
  let updatedGroups = 0;
  let updatedTemplates = 0;
  const missing: string[] = [];

  for (const spec of EPICURE_ISSUE_GROUP_SPECS) {
    const group = await scriptDb.query.issueGroups.findFirst({
      where: eq(issueGroups.title, spec.title),
      columns: { id: true, defaultSavedReplyId: true },
    });

    if (!group) {
      missing.push(spec.title);
      continue;
    }

    await scriptDb
      .update(issueGroups)
      .set({
        description: spec.description,
        color: spec.color,
        updatedAt: new Date(),
      })
      .where(eq(issueGroups.id, group.id));
    updatedGroups++;

    if (group.defaultSavedReplyId) {
      await scriptDb
        .update(savedReplies)
        .set({
          name: spec.templateName,
          content: spec.templateBody,
          updatedAt: new Date(),
        })
        .where(eq(savedReplies.id, group.defaultSavedReplyId));
      updatedTemplates++;
    }
  }

  console.log(`Updated ${updatedGroups} issue groups and ${updatedTemplates} saved-reply templates.`);
  if (missing.length > 0) {
    console.warn(
      `Skipped (no row with matching title)—create in dashboard or run db seed with EPICURE_SEED: ${missing.join(", ")}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => scriptPool.end());
