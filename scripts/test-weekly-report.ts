// Dry-run script to test weekly report without posting to Slack
import { endOfWeek, startOfWeek, subWeeks } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { TIME_ZONE } from "../jobs/generateDailyReports";
import { getMailbox } from "../lib/data/mailbox";
import { getMemberStats } from "../lib/data/stats";
import { getSlackUsersByEmail } from "../lib/slack/client";

console.log("🧪 Testing Weekly Report (DRY RUN - No Slack posting)\n");
console.log("=".repeat(60));

const mailbox = await getMailbox();
if (!mailbox) {
  console.log("❌ No mailbox found");
  process.exit(1);
}

console.log(`\n📮 Mailbox: ${mailbox.name}`);
console.log(`📱 Slack Channel: ${mailbox.slackAlertChannel || "NOT CONFIGURED"}`);

if (!mailbox.slackBotToken || !mailbox.slackAlertChannel) {
  console.log("⚠️  Slack configuration missing - report would not run in production");
}

// Calculate date range
const now = toZonedTime(new Date(), TIME_ZONE);
const lastWeekStart = subWeeks(startOfWeek(now, { weekStartsOn: 0 }), 1);
const lastWeekEnd = subWeeks(endOfWeek(now, { weekStartsOn: 0 }), 1);

console.log(`\n📅 Date Range (${TIME_ZONE}):`);
console.log(`   Start: ${lastWeekStart.toISOString()}`);
console.log(`   End:   ${lastWeekEnd.toISOString()}`);
console.log(
  `   Human: ${lastWeekStart.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} - ${lastWeekEnd.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`,
);

// Fetch stats
console.log(`\n📊 Fetching member stats...`);
const stats = await getMemberStats({
  startDate: lastWeekStart,
  endDate: lastWeekEnd,
});

if (!stats.length) {
  console.log("❌ No stats found for this date range");
  process.exit(0);
}

console.log(`✅ Found ${stats.length} team members\n`);

// Get Slack user mapping and names
let slackUsersByEmail = new Map<string, string>();
const slackUserNames = new Map<string, string>();

if (mailbox.slackBotToken) {
  slackUsersByEmail = await getSlackUsersByEmail(mailbox.slackBotToken);
  console.log(`📇 Mapped ${slackUsersByEmail.size} Slack users`);

  // Fetch actual user names
  console.log(`🔍 Fetching Slack user details...`);
  const { getSlackUser } = await import("../lib/slack/client");

  for (const [email, userId] of slackUsersByEmail.entries()) {
    try {
      const userInfo = await getSlackUser(mailbox.slackBotToken, userId);
      if (userInfo) {
        const displayName = userInfo.profile?.display_name || userInfo.profile?.real_name || userInfo.name || userId;
        slackUserNames.set(userId, displayName);
      }
    } catch (error) {
      // Continue on error, will fall back to email
    }
  }
  console.log(`✅ Fetched ${slackUserNames.size} user names\n`);
}

// Process members
const activeMembers = stats.filter((member) => member.replyCount > 0).sort((a, b) => b.replyCount - a.replyCount);
const inactiveMembers = stats.filter((member) => member.replyCount === 0);

console.log("=".repeat(60));
console.log("📈 WEEKLY REPORT PREVIEW");
console.log("=".repeat(60));

if (activeMembers.length > 0) {
  console.log(`\n✅ Team members (${activeMembers.length} active):`);
  activeMembers.forEach((member) => {
    const slackUserId = slackUsersByEmail.get(member.email!);
    const slackName = slackUserId ? slackUserNames.get(slackUserId) : null;
    const userName = slackName || member.displayName || member.email || "Unknown";
    const slackTag = slackUserId ? ` (@${slackUserId})` : "";
    console.log(`   • ${userName}${slackTag}: ${member.replyCount.toLocaleString()}`);
  });
}

if (inactiveMembers.length > 0) {
  console.log(`\n⭕ No tickets answered (${inactiveMembers.length}):`);
  const inactiveNames = inactiveMembers.map((member) => {
    const slackUserId = slackUsersByEmail.get(member.email!);
    const slackName = slackUserId ? slackUserNames.get(slackUserId) : null;
    return slackName || member.displayName || member.email || "Unknown";
  });
  console.log(`   ${inactiveNames.join(", ")}`);
}

const totalReplies = stats.reduce((sum, member) => sum + member.replyCount, 0);
const activeCount = activeMembers.length;
const peopleText = activeCount === 1 ? "person" : "people";

console.log(`\n📊 Summary:`);
console.log(`   Total replies: ${totalReplies.toLocaleString()} from ${activeCount} ${peopleText}`);

console.log(`\n${"=".repeat(60)}`);
console.log("✅ DRY RUN COMPLETE - No Slack message was sent");
console.log("=".repeat(60));
