import { db } from "@/db/client";
import { fetchRedditRSS } from "@/lib/reddit/rss";
import { listSlackChannels, postSlackMessage } from "@/lib/slack/client";

interface RedditPost {
  id: string;
  title: string;
  author: string;
  url: string;
  selftext: string;
  created_utc: number;
  permalink: string;
  score: number;
  num_comments: number;
}

const SUBREDDIT = "heypocketai";
const SLACK_CHANNEL_NAME = "community-reddit-alerts";
const CHECK_WINDOW_HOURS = 2;

/**
 * Fetch new posts from r/heypocketai and post them to Slack
 */
export async function checkRedditPosts() {
  try {
    const twoHoursAgo = Date.now() / 1000 - CHECK_WINDOW_HOURS * 60 * 60;

    console.log("=== Checking Reddit for new posts ===");
    console.log("Subreddit:", SUBREDDIT);
    console.log("Checking posts from:", new Date(twoHoursAgo * 1000).toISOString());

    // Fetch posts from Reddit using RSS feed (works from Vercel cloud IPs)
    const rssPosts = await fetchRedditRSS(SUBREDDIT);

    // Convert RSS posts to expected format
    const posts: RedditPost[] = rssPosts.map((rssPost) => ({
      id: rssPost.id,
      title: rssPost.title,
      author: rssPost.author,
      url: rssPost.link,
      selftext: rssPost.content,
      created_utc: Math.floor(rssPost.published.getTime() / 1000),
      permalink: rssPost.permalink,
      score: 0, // Not available in RSS feed
      num_comments: 0, // Not available in RSS feed
    }));

    // Filter for posts from the last 2 hours
    const recentPosts = posts.filter((post) => post.created_utc > twoHoursAgo);

    console.log(`Found ${recentPosts.length} posts from the last ${CHECK_WINDOW_HOURS} hours`);

    if (recentPosts.length === 0) {
      console.log("No recent posts to report");
      return { success: true, newPostsCount: 0 };
    }

    // Get Slack configuration
    const mailbox = await db.query.mailboxes.findFirst({
      columns: {
        slackBotToken: true,
      },
    });

    if (!mailbox?.slackBotToken) {
      console.error("No Slack bot token found");
      return { success: false, error: "No Slack configuration" };
    }

    // Find the #community-reddit-alerts channel
    const channels = await listSlackChannels(mailbox.slackBotToken);
    const targetChannel = channels.find((ch) => ch.name === SLACK_CHANNEL_NAME);

    if (!targetChannel?.id) {
      console.error(`Could not find #${SLACK_CHANNEL_NAME} channel`);
      return { success: false, error: "Slack channel not found" };
    }

    // Post each post to Slack (oldest first)
    const sortedPosts = recentPosts.sort((a, b) => a.created_utc - b.created_utc);

    for (const post of sortedPosts) {
      await postRedditPostToSlack(mailbox.slackBotToken, targetChannel.id, post);
    }

    console.log(`✅ Posted ${recentPosts.length} Reddit posts to Slack`);
    return { success: true, newPostsCount: recentPosts.length };
  } catch (error) {
    console.error("Error checking Reddit posts:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Post a Reddit post to Slack
 */
async function postRedditPostToSlack(token: string, channelId: string, post: RedditPost) {
  const redditUrl = `https://www.reddit.com${post.permalink}`;
  const postContent = post.selftext ? post.selftext.substring(0, 500) : "[No text content]";

  await postSlackMessage(token, {
    channel: channelId,
    text: `New Reddit post: ${post.title}`,
    blocks: [
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Title:*\n${post.title}`,
          },
          {
            type: "mrkdwn",
            text: `*Author:*\nu/${post.author}`,
          },
          {
            type: "mrkdwn",
            text: `*Score:*\n${post.score} ⬆️`,
          },
          {
            type: "mrkdwn",
            text: `*Comments:*\n${post.num_comments} 💬`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Content:*\n${postContent}${post.selftext.length > 500 ? "..." : ""}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View on Reddit",
              emoji: true,
            },
            url: redditUrl,
            style: "primary",
          },
        ],
      },
    ],
  });

  console.log(`Posted Reddit post: ${post.title}`);
  console.log(`  URL: ${redditUrl}`);
}
