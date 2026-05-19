import { conversationFollowersFactory } from "@tests/support/factories/conversationFollowers";
import { conversationFactory } from "@tests/support/factories/conversations";
import { userFactory } from "@tests/support/factories/users";
import { beforeEach, describe, expect, inject, it, vi } from "vitest";
import { sendFollowerNotification } from "@/jobs/sendFollowerNotification";
import * as sentryUtils from "@/lib/shared/sentry";

vi.mock("@/lib/env", () => ({
  env: {
    POSTGRES_URL: inject("TEST_DATABASE_URL"),
    AUTH_URL: "https://helperai.dev",
  },
}));

const mockSendEmail = vi.fn();
vi.mock("@/lib/emails/sendEmail", () => ({
  isSmtpConfigured: () => true,
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
vi.mock("@/lib/emails/followerNotification", () => ({
  default: vi.fn().mockReturnValue("Mock FollowerNotificationEmail component"),
}));
vi.mock("@/lib/shared/sentry", () => ({
  captureExceptionAndLog: vi.fn(),
}));

describe("sendFollowerNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
  });

  describe("successful notifications", () => {
    it("returns early when no followers are created", async () => {
      const { user: triggeredByUser } = await userFactory.createRootUser();
      const { conversation } = await conversationFactory.create();
      const result = await sendFollowerNotification({
        conversationId: conversation.id,
        eventType: "new_message",
        triggeredByUserId: triggeredByUser.id,
        eventDetails: {},
      });
      expect(result).toBeUndefined();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("sends notifications to all followers except the triggering user", async () => {
      const { user: triggeredByUser } = await userFactory.createRootUser();
      const { user: follower1 } = await userFactory.createRootUser({
        userOverrides: { email: "follower1@example.com" },
      });
      const { user: follower2 } = await userFactory.createRootUser({
        userOverrides: { email: "follower2@example.com" },
      });
      const { conversation } = await conversationFactory.create({
        subject: "Test Conversation",
      });

      await conversationFollowersFactory.create({ conversationId: conversation.id, userId: triggeredByUser.id });
      await conversationFollowersFactory.create({ conversationId: conversation.id, userId: follower1.id });
      await conversationFollowersFactory.create({ conversationId: conversation.id, userId: follower2.id });

      const result = await sendFollowerNotification({
        conversationId: conversation.id,
        eventType: "new_message",
        triggeredByUserId: triggeredByUser.id,
        eventDetails: {},
      });

      expect(mockSendEmail).toHaveBeenCalledTimes(2);
      expect(mockSendEmail).toHaveBeenCalledWith({
        to: "follower1@example.com",
        subject: 'New message in "Test Conversation"',
        react: "Mock FollowerNotificationEmail component",
      });
      expect(mockSendEmail).toHaveBeenCalledWith({
        to: "follower2@example.com",
        subject: 'New message in "Test Conversation"',
        react: "Mock FollowerNotificationEmail component",
      });

      expect(result).toEqual({
        conversationId: conversation.id,
        eventType: "new_message",
        emailResults: expect.any(Array),
        totalFollowers: 2,
      });
    });

    it("handles different event types with correct subjects", async () => {
      const { user: triggeredByUser } = await userFactory.createRootUser();
      const { user: follower } = await userFactory.createRootUser({ userOverrides: { email: "follower@example.com" } });
      const { conversation } = await conversationFactory.create({
        subject: "Event Test Conversation",
      });

      await conversationFollowersFactory.create({ conversationId: conversation.id, userId: follower.id });

      await sendFollowerNotification({
        conversationId: conversation.id,
        eventType: "status_change",
        triggeredByUserId: triggeredByUser.id,
        eventDetails: { oldStatus: "open", newStatus: "closed" },
      });

      expect(mockSendEmail).toHaveBeenLastCalledWith(
        expect.objectContaining({
          subject: 'Status changed in "Event Test Conversation"',
        }),
      );

      await sendFollowerNotification({
        conversationId: conversation.id,
        eventType: "assignment_change",
        triggeredByUserId: triggeredByUser.id,
        eventDetails: { oldAssignee: "John", newAssignee: "Jane" },
      });

      expect(mockSendEmail).toHaveBeenLastCalledWith(
        expect.objectContaining({
          subject: 'Assignment changed in "Event Test Conversation"',
        }),
      );

      await sendFollowerNotification({
        conversationId: conversation.id,
        eventType: "note_added",
        triggeredByUserId: triggeredByUser.id,
        eventDetails: {},
      });

      expect(mockSendEmail).toHaveBeenLastCalledWith(
        expect.objectContaining({
          subject: 'New note in "Event Test Conversation"',
        }),
      );

      expect(mockSendEmail).toHaveBeenCalledTimes(3);
    });
  });

  describe("early returns and validation", () => {
    it("returns early when conversationId is missing", async () => {
      const result = await sendFollowerNotification({
        conversationId: 0,
        eventType: "new_message",
        triggeredByUserId: "user-id",
        eventDetails: {},
      });

      expect(result).toBeUndefined();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("returns early when eventType is missing", async () => {
      const result = await sendFollowerNotification({
        conversationId: 1,
        eventType: "" as any,
        triggeredByUserId: "user-id",
        eventDetails: {},
      });

      expect(result).toBeUndefined();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("returns early when triggeredByUserId is missing", async () => {
      const result = await sendFollowerNotification({
        conversationId: 1,
        eventType: "new_message",
        triggeredByUserId: "",
        eventDetails: {},
      });

      expect(result).toBeUndefined();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("throws an error when the conversation is not found", async () => {
      const { user: triggeredByUser } = await userFactory.createRootUser();
      await expect(
        sendFollowerNotification({
          conversationId: 999999,
          eventType: "new_message",
          triggeredByUserId: triggeredByUser.id,
          eventDetails: {},
        }),
      ).rejects.toThrow("Conversation 999999 not found");
    });

    it("skips followers without email addresses", async () => {
      const { user: triggeredByUser } = await userFactory.createRootUser();
      const { user: followerWithEmail } = await userFactory.createRootUser({
        userOverrides: { email: "valid@example.com" },
      });
      const { user: followerWithoutEmail } = await userFactory.createRootUser({ userOverrides: { email: null } });
      const { conversation } = await conversationFactory.create();
      await conversationFollowersFactory.create({ conversationId: conversation.id, userId: followerWithEmail.id });
      await conversationFollowersFactory.create({ conversationId: conversation.id, userId: followerWithoutEmail.id });

      await sendFollowerNotification({
        conversationId: conversation.id,
        eventType: "new_message",
        triggeredByUserId: triggeredByUser.id,
        eventDetails: {},
      });

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "valid@example.com" }));
    });

    it("handles individual email sending failures gracefully", async () => {
      const { user: triggeredByUser } = await userFactory.createRootUser();
      const { user: follower1 } = await userFactory.createRootUser({ userOverrides: { email: "success@example.com" } });
      const { user: follower2 } = await userFactory.createRootUser({ userOverrides: { email: "failure@example.com" } });
      const { conversation } = await conversationFactory.create();
      await conversationFollowersFactory.create({ conversationId: conversation.id, userId: follower1.id });
      await conversationFollowersFactory.create({ conversationId: conversation.id, userId: follower2.id });

      const sendError = new Error("Email provider failed");
      mockSendEmail.mockImplementation((payload) => {
        if (payload.to === "failure@example.com") throw sendError;
        return { id: "success-id" };
      });

      const result = await sendFollowerNotification({
        conversationId: conversation.id,
        eventType: "new_message",
        triggeredByUserId: triggeredByUser.id,
        eventDetails: {},
      });

      expect(mockSendEmail).toHaveBeenCalledTimes(2);
      expect(sentryUtils.captureExceptionAndLog).toHaveBeenCalledWith(sendError);
      expect(result?.totalFollowers).toBe(2);
      expect(result?.emailResults).toHaveLength(2);
    });
  });
});
