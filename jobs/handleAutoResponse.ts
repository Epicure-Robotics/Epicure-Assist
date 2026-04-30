import { convertToCoreMessages, type Message } from "ai";
import { and, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { ToolRequestBody } from "@helperai/client";
import { assertDefined } from "@/components/utils/assert";
import { db } from "@/db/client";
import { conversationMessages, conversations, issueGroupConditions, issueGroups, savedReplies } from "@/db/schema";
import { runAIObjectQuery } from "@/lib/ai";
import {
  buildPromptMessages,
  checkTokenCountAndSummarizeIfNeeded,
  generateDraftResponse,
  loadPreviousMessages,
  respondWithAI,
} from "@/lib/ai/chat";
import { findFirstMatchingCondition } from "@/lib/ai/conditionChecker";
import { cleanUpTextForAI } from "@/lib/ai/core";
import { updateConversation } from "@/lib/data/conversation";
import {
  createConversationMessage,
  ensureCleanedUpText,
  getTextWithConversationSubject,
} from "@/lib/data/conversationMessage";
import { getMailbox } from "@/lib/data/mailbox";
import { createMessageNotification } from "@/lib/data/messageNotifications";
import { extractTemplateVariables, replaceTemplateVariables } from "@/lib/utils/templateVariables";

class AITimeoutError extends Error {}

export const handleAutoResponse = async ({
  messageId,
  tools,
  customerInfoUrl,
  responseTimeoutMs = 50_000,
}: {
  messageId: number;
  tools?: Record<string, ToolRequestBody>;
  customerInfoUrl?: string | null;
  responseTimeoutMs?: number;
}) => {
  const message = await db.query.conversationMessages
    .findFirst({
      where: eq(conversationMessages.id, messageId),
    })
    .then(assertDefined);

  const conversation = await db.query.conversations
    .findFirst({
      where: eq(conversations.id, message.conversationId),
    })
    .then(assertDefined);

  if (conversation.status === "spam") return { message: "Skipped - conversation is spam" };
  if (message.role === "staff") return { message: "Skipped - message is from staff" };

  const newerMessage = await db.query.conversationMessages.findFirst({
    columns: { id: true },
    where: and(
      eq(conversationMessages.conversationId, message.conversationId),
      inArray(conversationMessages.role, ["user", "staff", "ai_assistant"]),
      gt(conversationMessages.createdAt, message.createdAt),
    ),
  });

  if (newerMessage) return { message: "Skipped - newer message exists" };

  await ensureCleanedUpText(message);

  const mailbox = await getMailbox();
  if (!mailbox) return { message: "Skipped - mailbox not found" };

  // Check if this is the first message in the conversation (for condition templates)
  const existingMessages = await db.query.conversationMessages.findMany({
    columns: { id: true },
    where: and(
      eq(conversationMessages.conversationId, conversation.id),
      inArray(conversationMessages.role, ["user", "staff", "ai_assistant"]),
    ),
  });

  const isFirstMessage = existingMessages.length === 1;

  // For first messages, check if any conditions match for issue groups
  // This runs BEFORE the assignedToAI check so templates work regardless of AI assignment
  if (isFirstMessage && conversation.issueGroupId && mailbox.preferences?.autoRespondEmailToChat !== "draft") {
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
      `[ConditionTemplate] Conversation ${conversation.id}: Found ${conditions.length} conditions for issue group ${conversation.issueGroupId}`,
    );

    if (conditions.length > 0) {
      console.log(`[ConditionTemplate] Evaluating conditions for email: ${message.emailFrom}`);
      const matchResult = await findFirstMatchingCondition(conditions, message.emailFrom, conversation.subject ?? null);

      if (matchResult) {
        console.log(
          `[ConditionTemplate] Condition matched! ID: ${matchResult.matchedCondition.id}, Reasoning: ${matchResult.reasoning}`,
        );
        // Condition met - send the saved reply template
        const savedReply = await db.query.savedReplies.findFirst({
          where: eq(savedReplies.id, matchResult.matchedCondition.savedReplyId),
        });

        if (savedReply) {
          console.log(`[ConditionTemplate] Sending saved reply: ${savedReply.name}`);

          // If the template has variables, fill them using AI + knowledge base
          const templateVariables = extractTemplateVariables(savedReply.content);
          let finalContent = savedReply.content;

          if (templateVariables.length > 0) {
            console.log(
              `[ConditionTemplate] Template has variables: ${templateVariables.join(", ")} — filling with AI`,
            );
            try {
              const messageText = cleanUpTextForAI(
                [conversation.subject ?? "", message.cleanedUpText ?? message.body ?? ""].join("\n\n"),
              );

              const { messages: systemMessages } = await buildPromptMessages(
                mailbox,
                message.emailFrom,
                messageText,
                false,
                mailbox.customerInfoUrl,
              );

              const previousMessages = await loadPreviousMessages(conversation.id, message.id);
              const allMessages = [
                ...previousMessages,
                { id: message.id.toString(), role: "user", content: messageText } as Message,
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
                  Object.fromEntries(
                    templateVariables.map((v) => [v, z.string().describe(`Content for variable ${v}`)]),
                  ),
                ),
                messages: [...systemMessages, ...coreMessages],
              });

              finalContent = replaceTemplateVariables(savedReply.content, values as Record<string, string>);
              console.log(`[ConditionTemplate] Template variables filled successfully`);
            } catch (error) {
              console.error(`[ConditionTemplate] Failed to fill template variables, using raw template:`, error);
            }
          }

          // Create the template response message
          const templateMessage = await createConversationMessage({
            conversationId: conversation.id,
            responseToId: message.id,
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
            set: { status: "closed" },
            message: `Condition-based template sent: ${savedReply.name}`,
          });

          console.log(`[ConditionTemplate] SUCCESS - Template sent for conversation ${conversation.id}`);
          return {
            message: "Condition-based template sent",
            conditionId: matchResult.matchedCondition.id,
            savedReplyId: savedReply.id,
            savedReplyName: savedReply.name,
            templateMessageId: templateMessage.id,
          };
        }
      } else {
        console.log(`[ConditionTemplate] No conditions matched for conversation ${conversation.id}`);
      }
    }
  }

  // Continue with normal AI response flow
  if (!conversation.assignedToAI) {
    await updateConversation(conversation.id, { set: { status: "open" }, message: "Not assigned to AI" });
    return { message: "Skipped - not assigned to AI" };
  }

  // Check if conversation has an issue group
  if (!conversation.issueGroupId) {
    await updateConversation(conversation.id, { set: { status: "open" }, message: "No issue group assigned" });
    return { message: "Skipped - conversation has no issue group" };
  }

  // Fetch issue group to get custom prompt
  const issueGroup = await db.query.issueGroups.findFirst({
    where: eq(issueGroups.id, conversation.issueGroupId),
  });

  if (!issueGroup) {
    await updateConversation(conversation.id, { set: { status: "open" }, message: "Issue group not found" });
    return { message: "Skipped - issue group not found" };
  }

  const customPrompt = issueGroup.customPrompt || null;

  if (mailbox?.preferences?.autoRespondEmailToChat === "draft") {
    console.log(`[handleAutoResponse] Generating draft for conversation ${conversation.id} (mailbox: ${mailbox.name})`);
    const aiDraft = await generateDraftResponse(conversation.id, mailbox, tools);
    console.log(`[handleAutoResponse] Draft response generated for conversation ${conversation.id}, ID: ${aiDraft.id}`);
    return { message: "Draft response generated", draftId: aiDraft.id };
  }

  const emailText = (await getTextWithConversationSubject(conversation, message)).trim();
  if (emailText.length === 0) return { message: "Skipped - email text is empty" };

  const messageText = cleanUpTextForAI(
    [conversation.subject ?? "", message.cleanedUpText ?? message.body ?? ""].join("\n\n"),
  );
  const processedText = await checkTokenCountAndSummarizeIfNeeded(messageText);

  const sendResponse = async () => {
    const response = await respondWithAI({
      conversation,
      mailbox,
      tools,
      customerInfoUrl,
      userEmail: message.emailFrom,
      message: {
        id: message.id.toString(),
        content: processedText,
        role: "user",
      },
      messageId: message.id,
      readPageTool: null,
      sendEmail: true,
      guideEnabled: false,
      reasoningEnabled: false,
      customPrompt,
      onResponse: async ({ platformCustomer, humanSupportRequested }) => {
        await db.transaction(async (tx) => {
          if (platformCustomer && !humanSupportRequested) {
            await createMessageNotification({
              messageId: message.id,
              conversationId: message.conversationId,
              platformCustomerId: platformCustomer.id,
              notificationText: `You have a new reply for ${conversation.subject ?? "(no subject)"}`,
              tx,
            });
          }

          if (!humanSupportRequested) {
            await updateConversation(
              message.conversationId,
              {
                set: { status: "open" },
                message: "Automated reply sent (auto-response)",
              },
              tx,
            );
          }
        });
      },
    });

    // Consume the response to make sure we wait for the AI to generate it
    const reader = assertDefined(response.body).getReader();
    const decoder = new TextDecoder();
    let responseContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        responseContent += chunk;
      }
    }

    console.log("Auto response content:", responseContent);

    return { message: "Auto response sent", messageId };
  };

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new AITimeoutError()), responseTimeoutMs);
  });

  try {
    return await Promise.race([sendResponse(), timeoutPromise]);
  } catch (error) {
    if (error instanceof AITimeoutError) {
      await updateConversation(conversation.id, { set: { status: "open" }, message: "AI response timeout" });
      return { message: "Timeout - conversation set to open" };
    }
    throw error;
  }
};
