import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { conversationMessages, conversations, faqs, websitePages } from "@/db/schema";
import { cacheFor } from "@/lib/cache";
import { EPICURE_SAMPLE_QUESTIONS_CONTEXT } from "@/lib/epicure/companyKnowledge";
import { generateStructuredObject, type AvailableModel } from "./core";

const SAMPLE_QUESTIONS_PROMPT = `Based on the following knowledge base content, generate 9 diverse and helpful sample questions for **Epicure Robotics** (fresh food and beverage robotic kiosks, PARK platform, The Smoothie Bar 2.0, Zoe, and related deployments).

Make the questions:
- Succinct, one *short* sentence each
- Practical and actionable
- Varied in topic and complexity
- Natural and conversational
- Professional and customer-facing
- Grounded in robotics kiosks, menus, speed, hygiene, site requirements, pilots, partnerships, or operator experience when the content supports it

Include a balanced mix (label each with audience):
- **customer**: end users at a kiosk or website (menu, customization, allergens, speed, how to order, hygiene, ingredients like IQF fruit vs syrups, what Zoe vs Smoothie Bar offers)
- **client**: venues and buyers (offices, tech parks, gyms, malls, food courts, hospitals, pilots, footprint, power/water/Wi‑Fi, fleet monitoring, demos, deployment—not confidential procurement)

**Do not** generate questions that ask for or imply: manufacturing cost, unit selling price, BOM, margins, revenue, monthly revenue potential, MOQ as a price lever, internal traction statistics (cups sold, repeat rates, install targets), or other figures the team would only share privately. For commercial or pricing topics, prefer questions like "How do we get in touch for a commercial discussion?" that point to https://epicurerobotics.com/ rather than asking for numbers.

Return JSON with a "questions" array of objects: { "text": string, "audience": "customer" | "client" }.

Knowledge base content:
{{CONTENT}}

Recent conversation subjects:
{{TOPICS}}`;

interface SampleQuestion {
  text: string;
}

const SAMPLE_QUESTION_MODELS: AvailableModel[] = ["gpt-4o-mini"];
const MIN_CLIENT_QUESTIONS = 3;
const SAMPLE_QUESTIONS_CACHE_VERSION = "v3";

const FALLBACK_SAMPLE_QUESTIONS: SampleQuestion[] = [
  { text: "How are drinks prepared so quickly while keeping the machine hygienic between orders?" },
  { text: "What is the difference between Smoothie Bar 2.0 (IQF fruit smoothies) and Zoe’s drink lineup?" },
  { text: "Can I customize my drink for dairy-free, vegan, or extra protein options?" },
  { text: "What kind of footprint and hookups do Epicure kiosks need at our site (power, water, Wi‑Fi)?" },
  { text: "Where can I watch demos or read more on https://epicurerobotics.com/?" },
  { text: "We run a corporate campus; how do we explore a pilot kiosk for our employees?" },
  { text: "How do recipe updates and kiosk health monitoring work across multiple locations?" },
  { text: "How can we schedule a technical walkthrough or pilot for Zoe or Smoothie Bar 2.0 at our venue?" },
  { text: "What site requirements should we plan for (floor space, drainage, exhaust, network) before deployment?" },
  { text: "Do you support multi-location rollouts for offices, food courts, or gym chains?" },
  { text: "How do we reach your team for a commercial or partnership discussion via epicurerobotics.com?" },
  { text: "Do you build partner-branded kiosk programs similar to the coconut-water kiosk model?" },
];

const FALLBACK_CLIENT_QUESTIONS: SampleQuestion[] = [];

export const generateSampleQuestions = async (): Promise<SampleQuestion[]> => {
  const [latestFaq, latestWebsitePage, latestConversation, latestMessage] = await Promise.all([
    db
      .select({ updatedAt: faqs.updatedAt })
      .from(faqs)
      .where(eq(faqs.enabled, true))
      .orderBy(desc(faqs.updatedAt))
      .limit(1),
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
    .limit(12);

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

  const content = [EPICURE_SAMPLE_QUESTIONS_CONTEXT, faqContent, websiteContent, messageContent.slice(0, 4000)]
    .filter(Boolean)
    .join("\n\n");
  const topics = (topicContent || messageContent || "General support inquiries").slice(0, 3000);

  const prompt = SAMPLE_QUESTIONS_PROMPT.replace("{{CONTENT}}", content).replace("{{TOPICS}}", topics);

  let filteredQuestions: SampleQuestion[] = [];
  for (const model of SAMPLE_QUESTION_MODELS) {
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
    /demo|integration|client|enterprise|partnership|deployment|procurement|sales|proposal|b2b|pilot|kiosk|footprint|rollout|fleet|venue|site|park\b/i.test(
      q.text,
    ),
  ).length;
  if (existingClientCount < MIN_CLIENT_QUESTIONS) {
    const needed = MIN_CLIENT_QUESTIONS - existingClientCount;
    const extras = FALLBACK_CLIENT_QUESTIONS.filter(
      (candidate) =>
        !filteredQuestions.some((q) => q.text.toLowerCase().trim() === candidate.text.toLowerCase().trim()),
    ).slice(0, needed);
    filteredQuestions = [...extras, ...filteredQuestions].slice(0, 9);
  }

  await cache.set(filteredQuestions, 60 * 60 * 6);
  return filteredQuestions;
};
