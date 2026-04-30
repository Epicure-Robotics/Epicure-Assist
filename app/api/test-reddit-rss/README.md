# Reddit RSS Test Endpoint

This endpoint tests whether Reddit RSS feeds work from Vercel's cloud infrastructure.

## Testing Instructions

### 1. Local Test (Should Work)

```bash
# Start dev server
pnpm dev

# Test the endpoint
curl http://localhost:3000/api/test-reddit-rss
```

Or open in browser:
```
http://localhost:3000/api/test-reddit-rss
```

### 2. Vercel Test (Critical Test)

After deploying to Vercel:

```
https://your-app.vercel.app/api/test-reddit-rss
```

Or test with a specific subreddit:
```
https://your-app.vercel.app/api/test-reddit-rss?subreddit=technology
```

## Expected Response

If RSS works from Vercel, you'll see:

```json
{
  "success": true,
  "subreddit": "technology",
  "url": "https://www.reddit.com/r/technology/.rss",
  "totalPosts": 25,
  "recentPosts": 2,
  "allPosts": [...],
  "recentPostsData": [...],
  "message": "✅ RSS feed works! This endpoint is accessible from Vercel.",
  "instructions": "If you see this, RSS will work from Vercel. You can now update the cron job."
}
```

If it fails, you'll see:

```json
{
  "success": false,
  "error": "Reddit RSS error: 403 Forbidden"
}
```

## Next Steps

### If RSS Works from Vercel ✅

Update the `checkRedditPosts` job in `/jobs/checkRedditPosts.ts` to use the RSS feed instead of JSON API.

The helper function is already available at `/lib/reddit/rss.ts`:

```typescript
import { fetchRedditRSS } from "@/lib/reddit/rss";

// In checkRedditPosts job:
const posts = await fetchRedditRSS(SUBREDDIT);

// Convert to existing format
const redditPosts = posts.map(post => ({
  id: post.id,
  title: post.title,
  author: post.author,
  url: post.link,
  selftext: post.content,
  created_utc: Math.floor(post.published.getTime() / 1000),
  permalink: post.permalink,
  score: 0, // Not available in RSS
  num_comments: 0, // Not available in RSS
}));
```

### If RSS Fails from Vercel ❌

RSS feeds are also blocked. Alternative options:
1. Use a proxy service (costs money)
2. Manually monitor Reddit
3. Use a third-party Reddit scraping service
4. Set up a separate service on residential IP

## Cleanup

After testing, you can delete this test endpoint:
```bash
rm -rf app/api/test-reddit-rss
```
