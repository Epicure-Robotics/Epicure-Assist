// Script to manually trigger the weekly report
import { generateMailboxWeeklyReport } from "../jobs/generateWeeklyReports";

console.log("🚀 Running weekly report manually...\n");

const result = await generateMailboxWeeklyReport();

console.log("\n✅ Weekly report completed!");
console.log("Result:", result);
