// Script to manually trigger the daily report
import { generateMailboxDailyReport } from "../jobs/generateDailyReports";

console.log("🚀 Running daily report manually...\n");

const result = await generateMailboxDailyReport();

console.log("\n✅ Daily report completed!");
console.log("Result:", result);
