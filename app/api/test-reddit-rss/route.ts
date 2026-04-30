import { NextRequest, NextResponse } from "next/server";
import { fetchRedditRSS } from "@/lib/reddit/rss";

/**
 * Test endpoint to verify Reddit RSS works from Vercel
 * GET /api/test-reddit-rss
 */
export async function GET(request: NextRequest) {
  try {
    const subreddit = request.nextUrl.searchParams.get("subreddit") || "technology";
    const rssUrl = `https://www.reddit.com/r/${subreddit}/.rss`;

    console.log("🔍 Testing Reddit RSS from:", rssUrl);

    // Fetch posts using RSS
    const posts = await fetchRedditRSS(subreddit);

    // Filter posts from last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const recentPosts = posts.filter((post) => post.published > twoHoursAgo);

    console.log(`✅ RSS fetch successful! Found ${posts.length} total posts, ${recentPosts.length} from last 2 hours`);

    return NextResponse.json({
      success: true,
      subreddit,
      url: rssUrl,
      totalPosts: posts.length,
      recentPosts: recentPosts.length,
      allPosts: posts.map((p) => ({
        title: p.title,
        author: p.author,
        link: p.link,
        published: p.published.toISOString(),
        contentPreview: p.content.substring(0, 200),
      })),
      recentPostsData: recentPosts.map((p) => ({
        title: p.title,
        author: p.author,
        link: p.link,
        published: p.published.toISOString(),
        content: p.content,
      })),
      message: "✅ RSS feed works! This endpoint is accessible from Vercel.",
      instructions: "If you see this, RSS will work from Vercel. You can now update the cron job.",
    });
  } catch (error) {
    console.error("Error fetching Reddit RSS:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
