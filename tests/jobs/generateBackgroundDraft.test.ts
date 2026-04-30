import { conversationMessagesFactory } from "@tests/support/factories/conversationMessages";
import { conversationFactory } from "@tests/support/factories/conversations";
import { mailboxFactory } from "@tests/support/factories/mailboxes";
import { mockJobs } from "@tests/support/jobsUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateBackgroundDraft } from "@/jobs/generateBackgroundDraft";
import * as aiChat from "@/lib/ai/chat";
import * as realtimePublish from "@/lib/realtime/publish";

vi.mock("@/lib/ai/chat");
vi.mock("@/lib/realtime/publish");
vi.mock("@sentry/nextjs", () => ({
  setContext: vi.fn(),
  captureException: vi.fn(),
}));

mockJobs();

describe("generateBackgroundDraft", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(aiChat.generateDraftResponse).mockResolvedValue({
      id: 99,
      body: "<p>AI draft response</p>",
      responseToId: 1,
      status: "draft",
      role: "ai_assistant",
      createdAt: new Date(),
    } as any);
    vi.mocked(realtimePublish.publishToRealtime).mockResolvedValue(undefined);
  });

  it("generates a draft for a new user message", async () => {
    await mailboxFactory.create();
    const { conversation } = await conversationFactory.create();
    const { message } = await conversationMessagesFactory.create(conversation.id, { role: "user" });

    const result = await generateBackgroundDraft({ messageId: message.id });

    expect(aiChat.generateDraftResponse).toHaveBeenCalledWith(
      conversation.id,
      expect.objectContaining({ id: expect.any(Number) }),
    );
    expect(realtimePublish.publishToRealtime).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "conversation.draft",
      }),
    );
    expect(result).toBe("Draft generated (ID: 99)");
  });

  it("skips if message is not from a user", async () => {
    await mailboxFactory.create();
    const { conversation } = await conversationFactory.create();
    const { message } = await conversationMessagesFactory.create(conversation.id, { role: "staff" });

    const result = await generateBackgroundDraft({ messageId: message.id });

    expect(result).toBe("Skipped - not a user message");
    expect(aiChat.generateDraftResponse).not.toHaveBeenCalled();
  });

  it("skips if conversation is spam", async () => {
    await mailboxFactory.create();
    const { conversation } = await conversationFactory.create({ status: "spam" });
    const { message } = await conversationMessagesFactory.create(conversation.id, { role: "user" });

    const result = await generateBackgroundDraft({ messageId: message.id });

    expect(result).toBe("Skipped - conversation is spam");
    expect(aiChat.generateDraftResponse).not.toHaveBeenCalled();
  });

  it("skips if message not found", async () => {
    const result = await generateBackgroundDraft({ messageId: 999999 });

    expect(result).toBe("Skipped - message not found");
    expect(aiChat.generateDraftResponse).not.toHaveBeenCalled();
  });

  it("skips if staff already replied after user message", async () => {
    await mailboxFactory.create();
    const { conversation } = await conversationFactory.create();
    const { message: userMessage } = await conversationMessagesFactory.create(conversation.id, { role: "user" });
    await conversationMessagesFactory.create(conversation.id, { role: "staff" });

    const result = await generateBackgroundDraft({ messageId: userMessage.id });

    expect(result).toBe("Skipped - staff already replied after this message");
    expect(aiChat.generateDraftResponse).not.toHaveBeenCalled();
  });

  it("handles errors gracefully", async () => {
    await mailboxFactory.create();
    const { conversation } = await conversationFactory.create();
    const { message } = await conversationMessagesFactory.create(conversation.id, { role: "user" });

    vi.mocked(aiChat.generateDraftResponse).mockRejectedValue(new Error("AI service unavailable"));

    const result = await generateBackgroundDraft({ messageId: message.id });

    expect(result).toBe("Failed - AI service unavailable");
  });
});
