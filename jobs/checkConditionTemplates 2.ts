import { convertToCoreMessages, type Message } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { conversationMessages, conversations, issueGroupConditions, savedReplies } from "@/db/schema";
import { runAIObjectQuery } from "@/lib/ai";
import { buildPromptMessages, loadPreviousMessages } from "@/lib/ai/chat";
import { findFirstMatchingCondition } from "@/lib/ai/conditionChecker";
import { cleanUpTextForAI } from "@/lib/ai/core";
import { updateConversation } from "@/lib/data/conversation";
import { createConversationMessage } from "@/lib/data/conversationMessage";
import { getMailbox } from "@/lib/data/mailbox";
import { extractTemplateVariables, replaceTemplateVariables } from "@/lib/utils/templateVariables";

/**
 * Check if a conversation matches any condition templates for its issue group.
 * This should be called AFTER a conversation is assigned to an issue group.
 * Only runs for first messages in new conversations.
 */
export const checkConditionTemplates = async ({ conversationId }: { conversationId: number }) => {
  console.log(`[ConditionTemplate] Starting check for conversation ${conversationId}`);

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: {
      id: true,
      subject: true,
      issueGroupId: true,
      status: true,
    },
  });

  if (!conversation) {
    console.log(`[ConditionTemplate] Conversation ${conversationId} not found`);
    return { message: "Conversation not found" };
  }

  if (!conversation.issueGroupId) {
    console.log(`[ConditionTemplate] Conversation ${conversationId} has no issue group`);
    return { message: "No issue group assigned" };
  }

  // Get all messages to check if this is the first message
  const existingMessages = await db.query.conversationMessages.findMany({
    columns: { id: true },
    where: and(
      eq(conversationMessages.conversationId, conversationId),
      inArray(conversationMessages.role, ["user", "staff", "ai_assistant"]),
    ),
  });

  const isFirstMessage = existingMessages.length === 1;
  if (!isFirstMessage) {
    console.log(
      `[ConditionTemplate] Conversation ${conversationId} is not a new conversation (${existingMessages.length} messages)`,
    );
    return { message: "Not a first message" };
  }

  // Get the first user message
  const firstMessage = await db.query.conversationMessages.findFirst({
    where: and(eq(conversationMessages.conversationId, conversationId), eq(conversationMessages.role, "user")),
    columns: {
      id: true,
      emailFrom: true,
      body: true,
      cleanedUpText: true,
    },
  });

  if (!firstMessage) {
    console.log(`[ConditionTemplate] No user message found for conversation ${conversationId}`);
    return { message: "No user message found" };
  }

  // Get active conditions for this issue group
  const conditions = await db
    .select({
      id: issueGroupConditions.id,
      condition: issueGroupConditions.condition,
      savedReplyId: issueGroupConditions.savedReplyId,
    })
    .from(issueGroupConditions)
    .where(
      and(eq(issueGroupConditions.issueGroupId, conversation.issueGroupId), eq(issueGroupConditions.isActive, true)),
    );

  console.log(
    `[ConditionTemplate] Conversation ${conversationId}: Found ${conditions.length} conditions for issue group ${conversation.issueGroupId}`,
  );

  if (conditions.length === 0) {
    return { message: "No conditions configured for issue group" };
  }

  console.log(`[ConditionTemplate] Evaluating conditions for email: ${firstMessage.emailFrom}`);
  const matchResult = await findFirstMatchingCondition(
    conditions,
    firstMessage.emailFrom,
    conversation.subject ?? null,
  );

  if (!matchResult) {
    console.log(`[ConditionTemplate] No conditions matched for conversation ${conversationId}`);
    return { message: "No conditions matched" };
  }

  console.log(
    `[ConditionTemplate] Condition matched! ID: ${matchResult.matchedCondition.id}, Reasoning: ${matchResult.reasoning}`,
  );

  // Get the saved reply
  const savedReply = await db.query.savedReplies.findFirst({
    where: eq(savedReplies.id, matchResult.matchedCondition.savedReplyId),
  });

  if (!savedReply) {
    console.log(`[ConditionTemplate] Saved reply not found for condition ${matchResult.matchedCondition.id}`);
    return { message: "Saved reply not found" };
  }

  console.log(`[ConditionTemplate] Sending saved reply: ${savedReply.name}`);

  // If the template has variables, fill them using AI + knowledge base
  const templateVariables = extractTemplateVariables(savedReply.content);
  let finalContent = savedReply.content;

  if (templateVariables.length > 0) {
    console.log(`[ConditionTemplate] Template has variables: ${templateVariables.join(", ")} — filling with AI`);
    try {
      const mailbox = await getMailbox();
      if (mailbox) {
        const messageText = cleanUpTextForAI(
          [conversation.subject ?? "", firstMessage.cleanedUpText ?? firstMessage.body ?? ""].join("\n\n"),
        );

        const { messages: systemMessages } = await buildPromptMessages(
          mailbox,
          firstMessage.emailFrom,
          messageText,
          false,
          mailbox.customerInfoUrl,
        );

        const previousMessages = await loadPreviousMessages(conversationId, firstMessage.id);
        const allMessages = [
          ...previousMessages,
          { id: firstMessage.id.toString(), role: "user", content: messageText } as Message,
        ];
        const coreMessages = convertToCoreMessages(allMessages, { tools: {} });

        const prompt = `You are answering an email using a template. Provide content for ALL template variables. Do not include any URLs or links in your responses.\n\nTemplate variables to fill: ${templateVariables.join(", ")}`;
        if (systemMessages[0] && typeof systemMessages[0].content === "string") {
          systemMessages[0].content += `\n\n${prompt}`;
        }

        const values = await runAIObjectQuery({
          mailbox,
          queryType: "chat_completion",
          schema: z.object(
            Object.fromEntries(templateVariables.map((v) => [v, z.string().describe(`Content for variable ${v}`)])),
          ),
          messages: [...systemMessages, ...coreMessages],
        });

        finalContent = replaceTemplateVariables(savedReply.content, values as Record<string, string>);
        console.log(`[ConditionTemplate] Template variables filled successfully`);
      }
    } catch (error) {
      console.error(`[ConditionTemplate] Failed to fill template variables, using raw template:`, error);
    }
  }

  // Create the template response message
  const templateMessage = await createConversationMessage({
    conversationId: conversation.id,
    responseToId: firstMessage.id,
    status: "queueing",
    body: finalContent,
    cleanedUpText: finalContent,
    htmlBody: templateVariables.length > 0 ? finalContent : null,
    role: "ai_assistant",
    isPerfect: false,
    isPinned: false,
    isFlaggedAsBad: false,
    metadata: {
      conditionId: matchResult.matchedCondition.id,
      conditionReasoning: matchResult.reasoning,
      savedReplyId: savedReply.id,
      savedReplyName: savedReply.name,
    },
  });

  await updateConversation(conversation.id, {
    message: `Condition-based template sent: ${savedReply.name}`,
  });

  console.log(`[ConditionTemplate] SUCCESS - Template sent for conversation ${conversationId}`);

  return {
    message: "Condition-based template sent",
    conditionId: matchResult.matchedCondition.id,
    savedReplyId: savedReply.id,
    savedReplyName: savedReply.name,
    templateMessageId: templateMessage.id,
  };
};
