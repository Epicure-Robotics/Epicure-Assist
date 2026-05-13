import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { conversationMessages, conversations, faqs, websitePages } from "@/db/schema";
import { cacheFor } from "@/lib/cache";
import { DRAFT_MODEL, generateStructuredObject, type AvailableModel } from "./core";

const SAMPLE_QUESTIONS_PROMPT = `Based on the following knowledge base content, generate 9 diverse and helpful sample questions that users might want to ask. 

Make the questions:
- Succinct, one *short* sentence each
- Practical and actionable
- Varied in topic and complexity
- Natural and conversational
- Relevant to the provided content

For each question, also suggest an appropriate emoji that represents the topic.

Return the response as a JSON object with a "questions" array, containing objects with "text" and "emoji" fields.

Knowledge base content:
{{CONTENT}}

Recent conversation subjects:
{{TOPICS}}`;

interface SampleQuestion {
  text: string;
  emoji: string;
}

const SAMPLE_QUESTION_MODELS: AvailableModel[] = [DRAFT_MODEL, "gpt-4o-mini", "gpt-4.1"];

const FALLBACK_SAMPLE_QUESTIONS: SampleQuestion[] = [
  { text: "What services does Epicure Robotics provide?", emoji: "🤖" },
  { text: "How can I get support for a robot issue?", emoji: "🛠️" },
  { text: "How quickly can someone respond to my request?", emoji: "⏱️" },
  { text: "Can I schedule a demo with your team?", emoji: "📅" },
  { text: "What information should I include in a support ticket?", emoji: "📝" },
  { text: "Do you provide maintenance and troubleshooting guidance?", emoji: "🔧" },
  { text: "How do I follow up on an existing conversation?", emoji: "📨" },
  { text: "Can your team help with integration questions?", emoji: "🔌" },
  { text: "Where can I find product documentation and FAQs?", emoji: "📚" },
];

export const generateSampleQuestions = async (): Promise<SampleQuestion[]> => {
  const [latestFaq, latestWebsitePage, latestConversation, latestMessage] = await Promise.all([
    db.select({ updatedAt: faqs.updatedAt }).from(faqs).where(eq(faqs.enabled, true)).orderBy(desc(faqs.updatedAt)).limit(1),
    db
      .select({ updatedAt: websitePages.updatedAt })
      .from(websitePages)
      .where(isNull(websitePages.deletedAt))
      .orderBy(desc(websitePages.updatedAt))
      .limit(1),
    db
      .select({ updatedAt: conversations.updatedAt })
      .from(conversations)
      .orderBy(desc(conversations.updatedAt))
      .limit(1),
    db
      .select({ updatedAt: conversationMessages.updatedAt })
      .from(conversationMessages)
      .where(isNull(conversationMessages.deletedAt))
      .orderBy(desc(conversationMessages.updatedAt))
      .limit(1),
  ]);

  const freshnessKey = [
    latestFaq[0]?.updatedAt?.toISOString() ?? "0",
    latestWebsitePage[0]?.updatedAt?.toISOString() ?? "0",
    latestConversation[0]?.updatedAt?.toISOString() ?? "0",
    latestMessage[0]?.updatedAt?.toISOString() ?? "0",
  ].join(":");
  const cache = cacheFor<SampleQuestion[]>(`sample-questions:${freshnessKey}`);

  const cached = await cache.get();
  if (cached) {
    return cached;
  }

  const recentFaqs = await db.select({ content: faqs.content }).from(faqs).where(eq(faqs.enabled, true)).limit(10);

  const websiteTitles = await db
    .select({ title: websitePages.pageTitle, markdown: websitePages.markdown })
    .from(websitePages)
    .where(isNull(websitePages.deletedAt))
    .limit(20);

  const recentSubjects = await db
    .select({ subject: conversations.subject })
    .from(conversations)
    .where(isNotNull(conversations.subject))
    .orderBy(desc(conversations.createdAt))
    .limit(40);

  const recentConversationMessages = await db
    .select({ text: conversationMessages.cleanedUpText })
    .from(conversationMessages)
    .where(and(isNull(conversationMessages.deletedAt), inArray(conversationMessages.role, ["user", "staff"])))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(50);

  const faqContent = recentFaqs.map((f) => f.content).join("\n");
  const websiteContent = websiteTitles.map((w) => `${w.title}\n${w.markdown.slice(0, 300)}`).join("\n");
  const topicContent = recentSubjects.map((s) => `${s.subject}`).join("\n");
  const messageContent = recentConversationMessages
    .map((m) => (m.text ?? "").trim())
    .filter(Boolean)
    .join("\n");

  const content = [faqContent, websiteContent, messageContent.slice(0, 6000)].filter(Boolean).join("\n\n");
  const topics = (topicContent || messageContent || "General support inquiries").slice(0, 3000);

  const prompt = SAMPLE_QUESTIONS_PROMPT.replace("{{CONTENT}}", content).replace("{{TOPICS}}", topics);

  let filteredQuestions: SampleQuestion[] = [];
  for (const model of [...new Set(SAMPLE_QUESTION_MODELS)]) {
    try {
      const {
        object: { questions },
      } = await generateStructuredObject({
        model,
        prompt,
        schema: z.object({ questions: z.array(z.object({ text: z.string(), emoji: z.string() })) }),
      });
      filteredQuestions = questions.filter((q) => q.text && q.emoji && q.text.length > 10).slice(0, 9);
      if (filteredQuestions.length > 0) break;
    } catch {
      // Try the next model candidate.
    }
  }

  if (filteredQuestions.length === 0) {
    filteredQuestions = FALLBACK_SAMPLE_QUESTIONS;
  }

  await cache.set(filteredQuestions, 60 * 15);
  return filteredQuestions;
};
