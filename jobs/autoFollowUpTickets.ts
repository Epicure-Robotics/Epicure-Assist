import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { conversationMessages, conversations } from "@/db/schema";
import { updateConversation } from "@/lib/data/conversation";
import { createConversationMessage } from "@/lib/data/conversationMessage";
import { addNote } from "@/lib/data/note";

type FollowUpReport = {
  totalProcessed: number;
  day5FollowUps: number;
  day10FollowUps: number;
  day14Closures: number;
  conversationsProcessed: { id: number; slug: string; action: string }[];
  status: string;
};

const DAY_5_TEMPLATE = `Hey,

Just checking in - did my last message help?

If you need any clarification or have more questions, just let me know!

Emma
Epicure Robotics`;

const DAY_10_TEMPLATE = `Hey,

I haven't heard back, so wanted to reach out once more.

If I don't hear from you in the next 4 days, I'll close this ticket to keep things tidy. But no worries - you can reopen it anytime by replying to this email.

Let me know if you need anything else!

Emma
Epicure Robotics`;

const DAY_14_TEMPLATE = `Hey,

Since I haven't heard back, I'm closing this ticket for now.

If you still need help, just reply to this email and I'll reopen it right away!

Emma
Epicure Robotics`;

const convertPlainTextToHtml = (text: string) =>
  text
    .split("\n\n")
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");

const DAY_5_TEMPLATE_HTML = convertPlainTextToHtml(DAY_5_TEMPLATE);
const DAY_10_TEMPLATE_HTML = convertPlainTextToHtml(DAY_10_TEMPLATE);
const DAY_14_TEMPLATE_HTML = convertPlainTextToHtml(DAY_14_TEMPLATE);

export async function autoFollowUpTickets(): Promise<FollowUpReport> {
  const report: FollowUpReport = {
    totalProcessed: 0,
    day5FollowUps: 0,
    day10FollowUps: 0,
    day14Closures: 0,
    conversationsProcessed: [],
    status: "",
  };

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Calculate cutoff dates
  const day5Cutoff = new Date(now);
  day5Cutoff.setDate(day5Cutoff.getDate() - 5);

  const day10Cutoff = new Date(now);
  day10Cutoff.setDate(day10Cutoff.getDate() - 10);

  const day14Cutoff = new Date(now);
  day14Cutoff.setDate(day14Cutoff.getDate() - 14);

  // Find all conversations waiting on customer
  const waitingConversations = await db.query.conversations.findMany({
    where: eq(conversations.status, "waiting_on_customer"),
    columns: {
      id: true,
      slug: true,
      emailFrom: true,
      subject: true,
    },
  });

  if (waitingConversations.length === 0) {
    report.status = "No conversations waiting on customer found";
    return report;
  }

  for (const conversation of waitingConversations) {
    // Find the last staff or AI assistant message
    const lastStaffMessage = await db.query.conversationMessages.findFirst({
      where: and(
        eq(conversationMessages.conversationId, conversation.id),
        inArray(conversationMessages.role, ["staff", "ai_assistant"]),
        isNull(conversationMessages.deletedAt),
      ),
      orderBy: desc(conversationMessages.createdAt),
      columns: {
        id: true,
        createdAt: true,
        body: true,
      },
    });

    if (!lastStaffMessage) {
      continue; // Skip if no staff message found
    }

    const daysSinceLastStaffMessage = Math.floor(
      (now.getTime() - lastStaffMessage.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Check if we already sent a follow-up today for this conversation
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const followUpSentToday = await db.query.conversationMessages.findFirst({
      where: and(
        eq(conversationMessages.conversationId, conversation.id),
        inArray(conversationMessages.role, ["staff", "ai_assistant"]),
        isNull(conversationMessages.deletedAt),
        lt(conversationMessages.createdAt, todayStart),
      ),
      orderBy: desc(conversationMessages.createdAt),
      columns: {
        id: true,
        body: true,
        createdAt: true,
      },
    });

    // Check if this message is a follow-up template (to avoid duplicate sends)
    const isFollowUpTemplate = (body: string | null) => {
      if (!body) return false;
      return (
        body.includes("Just checking in") ||
        body.includes("I haven't heard back") ||
        body.includes("I'm closing this ticket")
      );
    };

    if (followUpSentToday && followUpSentToday.createdAt >= todayStart && isFollowUpTemplate(followUpSentToday.body)) {
      continue; // Skip if we already sent a follow-up today
    }

    let action = "";
    let template = "";
    let templateHtml: string | null = null;
    let noteMessage = "";

    // Determine which action to take
    if (daysSinceLastStaffMessage === 14) {
      // Day 14: Close ticket and send final email
      template = DAY_14_TEMPLATE;
      templateHtml = DAY_14_TEMPLATE_HTML;
      action = "Day 14: Auto-closed";
      noteMessage = "Auto-closed after 14 days of no response";

      // Create follow-up message
      await createConversationMessage({
        conversationId: conversation.id,
        responseToId: lastStaffMessage.id,
        status: "queueing",
        body: template,
        htmlBody: templateHtml,
        cleanedUpText: template,
        role: "staff",
        isPerfect: false,
        isPinned: false,
        isFlaggedAsBad: false,
        metadata: {
          autoFollowUp: true,
          followUpDay: 14,
        },
      });

      // Close the conversation
      await updateConversation(conversation.id, {
        set: { status: "closed" },
        type: "update",
        message: noteMessage,
      });

      // Add internal note
      await addNote({
        conversationId: conversation.id,
        message: noteMessage,
        user: null,
      });

      report.day14Closures++;
    } else if (daysSinceLastStaffMessage === 10) {
      // Day 10: Send second follow-up with warning
      template = DAY_10_TEMPLATE;
      templateHtml = DAY_10_TEMPLATE_HTML;
      action = "Day 10: Follow-up sent";
      noteMessage = "Auto follow-up sent (Day 10)";

      // Create follow-up message
      await createConversationMessage({
        conversationId: conversation.id,
        responseToId: lastStaffMessage.id,
        status: "queueing",
        body: template,
        htmlBody: templateHtml,
        cleanedUpText: template,
        role: "staff",
        isPerfect: false,
        isPinned: false,
        isFlaggedAsBad: false,
        metadata: {
          autoFollowUp: true,
          followUpDay: 10,
        },
      });

      // Ensure status remains waiting_on_customer after sending follow-up
      await updateConversation(conversation.id, {
        set: { status: "waiting_on_customer" },
      });

      // Add internal note
      await addNote({
        conversationId: conversation.id,
        message: noteMessage,
        user: null,
      });

      report.day10FollowUps++;
    } else if (daysSinceLastStaffMessage === 5) {
      // Day 5: Send first follow-up
      template = DAY_5_TEMPLATE;
      templateHtml = DAY_5_TEMPLATE_HTML;
      action = "Day 5: Follow-up sent";
      noteMessage = "Auto follow-up sent (Day 5)";

      // Create follow-up message
      await createConversationMessage({
        conversationId: conversation.id,
        responseToId: lastStaffMessage.id,
        status: "queueing",
        body: template,
        htmlBody: templateHtml,
        cleanedUpText: template,
        role: "staff",
        isPerfect: false,
        isPinned: false,
        isFlaggedAsBad: false,
        metadata: {
          autoFollowUp: true,
          followUpDay: 5,
        },
      });

      // Ensure status remains waiting_on_customer after sending follow-up
      await updateConversation(conversation.id, {
        set: { status: "waiting_on_customer" },
      });

      // Add internal note
      await addNote({
        conversationId: conversation.id,
        message: noteMessage,
        user: null,
      });

      report.day5FollowUps++;
    } else {
      continue; // Not at a follow-up milestone yet
    }

    if (action) {
      report.totalProcessed++;
      report.conversationsProcessed.push({
        id: conversation.id,
        slug: conversation.slug,
        action,
      });
    }
  }

  report.status = `Processed ${report.totalProcessed} conversations: ${report.day5FollowUps} day-5 follow-ups, ${report.day10FollowUps} day-10 follow-ups, ${report.day14Closures} closures`;
  return report;
}
