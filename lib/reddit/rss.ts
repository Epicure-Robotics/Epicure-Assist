/**
 * Reddit RSS/Atom feed fetcher
 * Uses RSS feeds instead of JSON API to avoid Vercel IP blocking
 */

export interface RedditRSSPost {
  id: string;
  title: string;
  author: string;
  link: string;
  permalink: string;
  published: Date;
  content: string;
  contentHtml: string;
}

/**
 * Parse Reddit RSS feed (Atom XML format)
 */
export function parseRedditRSS(rssText: string): RedditRSSPost[] {
  const posts: RedditRSSPost[] = [];

  // Extract entry elements from Atom feed
  const entryMatches = rssText.matchAll(/<entry>([\s\S]*?)<\/entry>/g);

  for (const match of entryMatches) {
    const entry = match[1];
    if (!entry) continue;

    // Extract fields
    const titleMatch = /<title>(.*?)<\/title>/.exec(entry);
    const title = titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1].trim()) : "";

    const linkMatch = /<link href="(.*?)"/.exec(entry);
    const link = linkMatch?.[1]?.trim() || "";

    const authorMatch = /<name>(.*?)<\/name>/.exec(entry);
    const author = authorMatch?.[1]?.trim().replace(/^\/u\//, "") || "";

    const publishedMatch = /<published>(.*?)<\/published>/.exec(entry);
    const published = publishedMatch?.[1] ? new Date(publishedMatch[1].trim()) : new Date();

    const idMatch = /<id>(.*?)<\/id>/.exec(entry);
    const id = idMatch?.[1]?.trim().split("/").pop() || "";

    const contentMatch = /<content type="html">([\s\S]*?)<\/content>/.exec(entry);
    const contentHtml = contentMatch?.[1]?.trim() || "";
    const content = contentHtml ? stripHtmlTags(decodeHtmlEntities(contentHtml)) : "";

    // Extract permalink from link (remove query params)
    const permalink = link.split("?")[0]?.replace("https://www.reddit.com", "") || "";

    if (title && link && id) {
      posts.push({
        id,
        title,
        author,
        link,
        permalink,
        published,
        content,
        contentHtml,
      });
    }
  }

  return posts;
}

/**
 * Fetch Reddit RSS feed for a subreddit
 */
export async function fetchRedditRSS(subreddit: string): Promise<RedditRSSPost[]> {
  const rssUrl = `https://www.reddit.com/r/${subreddit}/.rss`;

  const response = await fetch(rssUrl, {
    headers: {
      "User-Agent": "web:epicure-inbox:v1.0.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Reddit RSS error: ${response.status} ${response.statusText}`);
  }

  const rssText = await response.text();
  return parseRedditRSS(rssText);
}

/**
 * Decode HTML entities (e.g., &amp; -> &, &lt; -> <)
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
  };

  return text.replace(/&[a-z]+;|&#\d+;/gi, (match) => entities[match] || match);
}

/**
 * Strip HTML tags from text
 */
function stripHtmlTags(html: string): string {
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, " ");
  // Decode entities
  text = decodeHtmlEntities(text);
  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();
  return text;
}
