const normalizeGreetingQuery = (query: string) =>
  query
    .trim()
    .toLowerCase()
    .replace(/[!?.]+$/g, "")
    .replace(/\s+/g, " ");

const INSTANT_GREETING_REPLIES: Record<string, string> = {
  hi: "Hello! How can I assist you today?",
  hii: "Hello! How can I assist you today?",
  hiii: "Hello! How can I assist you today?",
  hello: "Hello! How can I assist you today?",
  hey: "Hello! How can I assist you today?",
  "good morning": "Good morning! How can I assist you today?",
  "good afternoon": "Good afternoon! How can I assist you today?",
  "good evening": "Good evening! How can I assist you today?",
};

export const getInstantGreetingReply = (content: string | undefined | null): string | null => {
  if (!content) return null;
  return INSTANT_GREETING_REPLIES[normalizeGreetingQuery(content)] ?? null;
};
