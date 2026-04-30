import { userFactory } from "@tests/support/factories/users";
import { describe, expect, it, vi } from "vitest";
import * as aiModule from "@/lib/ai";
import { MINI_MODEL } from "@/lib/ai/core";
import { emailKeywordsExtractor } from "@/lib/emailKeywordsExtractor";

vi.mock("@/lib/ai", async () => {
  const actual = await vi.importActual("@/lib/ai");
  return {
    ...actual,
    runAIQuery: vi.fn(),
  };
});

describe("emailKeywordsExtractor", () => {
  it("returns email keywords", async () => {
    const { mailbox } = await userFactory.createRootUser();

    vi.mocked(aiModule.runAIQuery).mockResolvedValue({ text: "dealer program epicure" } as any);

    const keywords = await emailKeywordsExtractor({
      mailbox,
      subject: "Recent purchase failed",
      body: "How do I join the Epicure dealer program?",
    });

    expect(keywords.toSorted()).toEqual(["dealer", "program", "epicure"].toSorted());

    expect(aiModule.runAIQuery).toHaveBeenCalledWith({
      functionId: "email-keywords-extractor",
      mailbox,
      queryType: "email_keywords_extractor",
      messages: [
        {
          role: "user",
          content: "Recent purchase failed\n\nHow do I join the Epicure dealer program?",
        },
      ],
      system: expect.stringContaining("Generate a space-delimited list of 1-3 keywords"),
      temperature: 0,
      model: MINI_MODEL,
      maxTokens: 500,
    });
  });
});
