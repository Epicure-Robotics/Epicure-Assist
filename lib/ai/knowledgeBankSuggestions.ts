import { z } from "zod";
import type { mailboxes } from "@/db/schema";
import { runAIObjectQuery } from "@/lib/ai";
import { findEnabledKnowledgeBankEntries } from "@/lib/data/retrieval";

const knowledgeBankSuggestionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("no_action"),
    reason: z.string(),
  }),
  z.object({
    action: z.literal("create_entry"),
    reason: z.string(),
    content: z.string().min(1),
  }),
  z.object({
    action: z.literal("update_entry"),
    reason: z.string(),
    content: z.string().min(1),
    entryId: z.number(),
  }),
]);

type KnowledgeBankSuggestion = z.infer<typeof knowledgeBankSuggestionSchema>;

type SuggestionContext =
  | { type: "human_reply"; messageContent: string; additionalContext?: string }
  | { type: "bad_response"; messageContent: string; additionalContext?: string }
  | { type: "resolved_conversation"; conversationText: string };

export const generateKnowledgeBankSuggestion = async (
  mailbox: typeof mailboxes.$inferSelect,
  context: SuggestionContext,
): Promise<KnowledgeBankSuggestion> => {
  const similarFAQs = await findEnabledKnowledgeBankEntries(mailbox.id);

  const baseSystemPrompt = `
You are analyzing content to determine if it should lead to changes in a knowledge bank.

Based on the content and existing entries in the knowledge bank, decide on one of these actions:
1. no_action - No change needed to the knowledge bank. Choose this if:
   - The information is already well covered by existing entries
   - The content is too specific to one situation
   - The content doesn't contain valuable, reusable information

2. create_entry - Create a new entry in the knowledge bank. Choose this if:
   - The content contains useful general information not covered by existing entries
   - The content provides step-by-step instructions for new scenarios
   - The content explains policies or technical details that could be reused

3. update_entry - Update an existing entry in the knowledge bank. Choose this if:
   - The content contains improved/more detailed information that enhances an existing entry
   - The content provides corrections or updates to outdated information
   - The content adds important context or clarifications to existing content
   - An existing entry is incomplete and this content fills the gaps

If you choose create_entry, provide the content for the new entry.
If you choose update_entry, provide the improved content and specify which entry ID to update.

Extract only the valuable, reusable information. Remove customer-specific details, greetings, and conversational elements. Focus on the core information that would be useful for future similar situations.

Respond with a JSON object with these fields:
- action: "no_action", "create_entry", or "update_entry"
- reason: A brief explanation of your decision
- content: The content for the new/updated entry (only for create_entry and update_entry)
- entryId: The ID of the entry to update (only for update_entry)
`;

  let contextSpecificPrompt: string;
  if (context.type === "human_reply") {
    contextSpecificPrompt = `
You are analyzing a human agent's reply to a customer support inquiry to extract valuable knowledge.

Human agent's reply:
"${context.messageContent}"
`;
  } else if (context.type === "bad_response") {
    contextSpecificPrompt = `
You are analyzing a message that was flagged as a bad response in a customer support system.

Message that was flagged as bad:
"${context.messageContent}"

Reason for flagging:
"${context.additionalContext || "No reason provided"}"
`;
  } else {
    contextSpecificPrompt = `
You are analyzing a fully resolved customer support conversation to extract reusable knowledge.
Focus on the solution or answer the agent provided. Only suggest creating or updating an entry if the conversation contains genuinely reusable, generalizable information.

Full conversation:
${context.conversationText}
`;
  }

  const userPrompt = `
${contextSpecificPrompt}

Existing entries in knowledge bank:
${similarFAQs.map((faq) => `ID: ${faq.id}\nContent: "${faq.content}"`).join("\n\n")}
`;

  const suggestion = await runAIObjectQuery({
    system: baseSystemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    mailbox,
    queryType: "suggest_knowledge_bank_changes",
    schema: knowledgeBankSuggestionSchema,
  });

  return suggestion;
};
