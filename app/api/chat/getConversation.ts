import { getConversationBySlugAndMailbox } from "@/lib/data/conversation";
import { WidgetSessionPayload } from "@/lib/widgetSession";

export const getConversation = async (conversationSlug: string, session: WidgetSessionPayload) => {
  const conversation = await getConversationBySlugAndMailbox(conversationSlug);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Allow access if either:
  // 1. The session has a matching anonymousSessionId (for anonymous sessions)
  // 2. The session has a matching email address (for authenticated sessions)
  const hasAnonymousAccess =
    session.isAnonymous && session.anonymousSessionId && conversation.anonymousSessionId === session.anonymousSessionId;
  const hasEmailAccess = !session.isAnonymous && session.email && conversation.emailFrom === session.email;

  // Debug logging
  console.log("[getConversation] Authorization check:", {
    conversationSlug,
    "session.isAnonymous": session.isAnonymous,
    "session.anonymousSessionId": session.anonymousSessionId,
    "session.email": session.email,
    "conversation.anonymousSessionId": conversation.anonymousSessionId,
    "conversation.emailFrom": conversation.emailFrom,
    hasAnonymousAccess,
    hasEmailAccess,
  });

  if (!hasAnonymousAccess && !hasEmailAccess) {
    throw new Error("Unauthorized");
  }

  return conversation;
};
