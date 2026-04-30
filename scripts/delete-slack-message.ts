#!/usr/bin/env tsx

/* eslint-disable no-console */

/**
 * Deletes a Slack message sent by the helper bot.
 *
 * Usage:
 *   pnpm with-dev-env tsx scripts/delete-slack-message.ts --channel <channel-id> --ts <message-ts>
 *
 * Options:
 *   --channel   Slack channel ID (e.g. C01234567)
 *   --ts        Message timestamp (e.g. 1700000000.123456)
 *   --token     (Optional) Override the bot token instead of loading from DB
 */
import { WebClient } from "@slack/web-api";
import { getMailbox } from "@/lib/data/mailbox";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  return {
    channel: get("--channel"),
    ts: get("--ts"),
    token: get("--token"),
  };
};

const deleteSlackMessage = async () => {
  const { channel, ts, token: tokenOverride } = parseArgs();

  if (!channel || !ts) {
    console.error("Usage: tsx scripts/delete-slack-message.ts --channel <channel-id> --ts <message-ts>");
    console.error("  --channel   Slack channel ID (e.g. C01234567)");
    console.error("  --ts        Message timestamp (e.g. 1700000000.123456)");
    console.error("  --token     (Optional) Override the bot token instead of loading from DB");
    process.exit(1);
  }

  const token = tokenOverride ?? (await getMailbox())?.slackBotToken;
  if (!token) {
    throw new Error("No Slack bot token found. Either pass --token or ensure a mailbox with a Slack bot token exists.");
  }

  const client = new WebClient(token);

  console.log(`Deleting message ts=${ts} from channel=${channel} ...`);

  const response = await client.chat.delete({ channel, ts });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.error}`);
  }

  console.log("Message deleted successfully.");
};

deleteSlackMessage()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to delete Slack message:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
