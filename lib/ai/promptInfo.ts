export type PromptInfo = {
  systemPrompt: string;
  knowledgeBank: string | null;
  knowledgeBankEntryIds: number[];
  websitePages: { url: string; title: string; similarity: number }[];
  userPrompt: string;
  availableTools: string[];
};
