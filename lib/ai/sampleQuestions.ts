import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { conversationMessages, conversations, faqs, websitePages } from "@/db/schema";
import { cacheFor } from "@/lib/cache";
import { DRAFT_MODEL, generateStructuredObject, type AvailableModel } from "./core";

const SAMPLE_QUESTIONS_PROMPT = `Based on the following knowledge base content, generate 9 diverse and helpful sample questions.

Make the questions:
- Succinct, one *short* sentence each
- Practical and actionable
- Varied in topic and complexity
- Natural and conversational
- Relevant to the provided content
- Professional and customer-facing
- Include a balanced mix of:
  - End-customer support questions (orders, products, pricing, delivery, troubleshooting)
  - CRM/client-enquiry questions from business prospects (demo requests, partnerships, integrations, deployments, procurement)
- Reflect all relevant brands and offerings mentioned in the knowledge base (including Epicure Robotics, Zoe, Smoothie Bar, and related services)

Return the response as a JSON object with a "questions" array, containing objects with a "text" field only.

Knowledge base content:
{{CONTENT}}

Recent conversation subjects:
{{TOPICS}}`;

interface SampleQuestion {
  text: string;
}

const SAMPLE_QUESTION_MODELS: AvailableModel[] = [DRAFT_MODEL, "gpt-4o-mini", "gpt-4.1"];
const MIN_CLIENT_QUESTIONS = 3;
const SAMPLE_QUESTIONS_CACHE_VERSION = "v2";

const FALLBACK_SAMPLE_QUESTIONS: SampleQuestion[] = [
  { text: "What are your best-selling smoothies and functional drinks right now?" },
  { text: "Do you offer dairy-free, vegan, or high-protein options across your menu?" },
  { text: "Can I customize ingredients and nutrition preferences before placing an order?" },
  { text: "What are your current pricing, package sizes, and delivery timelines?" },
  { text: "How can I schedule a demo for Epicure Robotics or Zoe solutions?" },
  { text: "Do you support B2B partnerships for offices, events, or retail locations?" },
  { text: "What integrations are available for POS, CRM, or kiosk workflows?" },
  { text: "What is the onboarding process and timeline for a new client deployment?" },
  { text: "Who should I contact for sales enquiries and enterprise support?" },
];

const FALLBACK_CLIENT_QUESTIONS: SampleQuestion[] = [
  { text: "How can I schedule a product demo for Epicure Robotics or Zoe?" },
  { text: "Do you provide deployment support for multi-location smoothie bar rollouts?" },
  { text: "What integration options are available for POS and CRM systems?" },
  { text: "Can you share enterprise pricing and commercial proposal details?" },
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
  const cache = cacheFor<SampleQuestion[]>(`sample-questions:${SAMPLE_QUESTIONS_CACHE_VERSION}:${freshnessKey}`);

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
        schema: z.object({
          questions: z.array(
            z.object({
              text: z.string(),
              audience: z.enum(["customer", "client"]),
            }),
          ),
        }),
      });
      const deduped = Array.from(
        new Map(
          questions
            .filter((q) => q.text && q.text.length > 10)
            .map((q) => [q.text.toLowerCase().trim(), { text: q.text.trim(), audience: q.audience }]),
        ).values(),
      );
      const clientQuestions = deduped.filter((q) => q.audience === "client").map((q) => ({ text: q.text }));
      const customerQuestions = deduped.filter((q) => q.audience === "customer").map((q) => ({ text: q.text }));
      filteredQuestions = [...clientQuestions, ...customerQuestions].slice(0, 9);
      if (filteredQuestions.length > 0) break;
    } catch {
      // Try the next model candidate.
    }
  }

  if (filteredQuestions.length === 0) {
    filteredQuestions = FALLBACK_SAMPLE_QUESTIONS;
  }

  const existingClientCount = filteredQuestions.filter((q) =>
    /demo|integration|client|enterprise|partnership|deployment|procurement|sales|proposal|b2b/i.test(q.text),
  ).length;
  if (existingClientCount < MIN_CLIENT_QUESTIONS) {
    const needed = MIN_CLIENT_QUESTIONS - existingClientCount;
    const extras = FALLBACK_CLIENT_QUESTIONS.filter(
      (candidate) =>
        !filteredQuestions.some((q) => q.text.toLowerCase().trim() === candidate.text.toLowerCase().trim()),
    ).slice(0, needed);
    filteredQuestions = [...extras, ...filteredQuestions].slice(0, 9);
  }

  await cache.set(filteredQuestions, 60 * 15);
  return filteredQuestions;
};
