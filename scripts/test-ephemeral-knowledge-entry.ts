#!/usr/bin/env tsx

/* eslint-disable no-console */

/**
 * Tests sending an ephemeral knowledge base entry confirmation message to bharat@openvision.engineering.
 *
 * Usage:
 *   pnpm with-dev-env tsx scripts/test-ephemeral-knowledge-entry.ts --channel <channel-id> --thread-ts <thread-ts>
 *
 * Options:
 *   --channel    Slack channel ID where the message should be posted (e.g. C01234567)
 *   --thread-ts  Thread timestamp to post in (e.g. 1700000000.123456). If omitted, posts in channel root.
 *   --token      (Optional) Override the bot token instead of loading from DB
 */
import { WebClient } from "@slack/web-api";
import { getMailbox } from "@/lib/data/mailbox";
import { findUserViaSlack } from "@/lib/data/user";
import { getSlackUsersByEmail } from "@/lib/slack/client";

const TARGET_EMAIL = "bharat@openvision.engineering";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  return {
    channel: get("--channel"),
    threadTs: get("--thread-ts"),
    token: get("--token"),
  };
};

const run = async () => {
  const { channel, threadTs, token: tokenOverride } = parseArgs();

  if (!channel) {
    console.error(
      "Usage: pnpm with-dev-env tsx scripts/test-ephemeral-knowledge-entry.ts --channel <channel-id> [--thread-ts <ts>]",
    );
    console.error("  --channel    Slack channel ID (e.g. C01234567)");
    console.error("  --thread-ts  Thread timestamp (optional)");
    console.error("  --token      (Optional) Override the bot token");
    process.exit(1);
  }

  const mailbox = await getMailbox();
  const token = tokenOverride ?? mailbox?.slackBotToken;
  if (!token) {
    throw new Error("No Slack bot token found. Either pass --token or ensure a mailbox with a Slack bot token exists.");
  }

  // Look up the Slack user ID for the target email
  console.log(`Looking up Slack user for ${TARGET_EMAIL}...`);
  const usersByEmail = await getSlackUsersByEmail(token);
  const slackUserId = usersByEmail.get(TARGET_EMAIL);

  if (!slackUserId) {
    throw new Error(`Could not find a Slack user with email ${TARGET_EMAIL}. Make sure their Slack email matches.`);
  }

  console.log(`Found Slack user ID: ${slackUserId}`);

  // Verify via findUserViaSlack (same check used in handleSlackAgentMessage)
  const user = await findUserViaSlack(token, slackUserId);
  console.log(`Resolved team user: ${user?.email ?? "(not found)"}`);

  if (user?.email !== TARGET_EMAIL) {
    throw new Error(`Email mismatch: expected ${TARGET_EMAIL}, got ${user?.email}`);
  }

  const client = new WebClient(token);

  const sampleEntry = `## Payment Refund Policy
Customers can request a full refund within 30 days of purchase. Refunds are processed within 5-7 business days.`;

  console.log(`Posting ephemeral knowledge entry confirmation to ${TARGET_EMAIL} in channel ${channel}...`);

  const response = await client.chat.postEphemeral({
    channel,
    ...(threadTs ? { thread_ts: threadTs } : {}),
    user: slackUserId,
    text: `Knowledge base entry to save:\n${sampleEntry}`,
    blocks: [
      {
        type: "section",
        block_id: "proposed_entry",
        text: {
          type: "mrkdwn",
          text: `*Entry to save:*\n${sampleEntry}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Save entry", emoji: true },
            value: "confirm",
            style: "primary",
            action_id: "confirm",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Cancel" },
            value: "cancel",
            action_id: "cancel",
          },
        ],
      },
    ],
  });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.error}`);
  }

  console.log(`Ephemeral message sent. message_ts=${response.message_ts}`);
  console.log(`Only ${TARGET_EMAIL} can see it in channel ${channel}.`);
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
