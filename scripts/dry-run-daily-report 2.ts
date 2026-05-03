import { generateMailboxDailyReport } from "../jobs/generateDailyReports";

console.log("Running daily report in dry-run mode...");

const result = await generateMailboxDailyReport({ dryRun: true });

if (!result) {
  console.log("No report generated (mailbox may be missing Slack configuration).");
  process.exit(0);
}

console.log("Dry-run complete. Slack payload preview:");
console.log(JSON.stringify(result, null, 2));
