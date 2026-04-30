import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { conversations } from "@/db/schema/conversations";
import { issueGroups } from "@/db/schema/issueGroups";
import { runAIObjectQuery } from "@/lib/ai";
import { cacheFor } from "@/lib/cache";
import { Conversation, updateConversation } from "@/lib/data/conversation";
import { getMailbox, Mailbox } from "@/lib/data/mailbox";
import { getUsersWithMailboxAccess, UserRoles, type UserWithMailboxAccessData } from "@/lib/data/user";
import { triggerEvent } from "./trigger";
import { assertDefinedOrRaiseNonRetriableError } from "./utils";

const CACHE_ROUND_ROBIN_KEY_PREFIX = "auto-assign-message-queue";

const getCoreTeamMembers = (teamMembers: UserWithMailboxAccessData[]): UserWithMailboxAccessData[] => {
  return teamMembers.filter((member) => member.role === UserRoles.CORE);
};

const getNonCoreTeamMembersWithMatchingKeywords = async (
  teamMembers: UserWithMailboxAccessData[],
  conversationContent: string,
  mailbox: Mailbox,
) => {
  if (!conversationContent) return { members: [] };

  const membersWithKeywords = teamMembers.filter(
    (member) => member.role === UserRoles.NON_CORE && member.keywords.length > 0,
  );

  if (membersWithKeywords.length === 0) return { members: [] };

  const memberKeywords = membersWithKeywords.reduce<Record<string, string[]>>((acc, member) => {
    acc[member.id] = member.keywords;
    return acc;
  }, {});

  const result = await runAIObjectQuery({
    mailbox,
    queryType: "auto_assign_conversation",
    schema: z.object({
      matches: z.record(z.string(), z.boolean()),
      reasoning: z.string(),
      confidenceScore: z.number().optional(),
    }),
    system: `You are an Intelligent Support Routing System that connects customer inquiries to team members with the most relevant expertise.

Your task is to analyze the semantic meaning of conversations and determine which team members' expertise keywords align with the customer's needs, even when there's no exact keyword match.

For each potential match, consider:
- Direct relevance: Is the keyword directly related to the topic?
- Implied needs: Does the customer's issue typically require this expertise?
- Domain knowledge: Would someone with this keyword expertise be equipped to help?
- Technical depth: Does the conversation's complexity match the expertise level?

When determining matches, provide clear reasoning about why each team member's keywords do or don't align with the conversation. Be especially attentive to technical topics that may use different terminology but relate to the same domain.

A strong match occurs when the team member's expertise would be valuable in addressing the core problem, not just peripheral aspects of the conversation.

Return false for all team members if you cannot find a strong match.`,
    messages: [
      {
        role: "user",
        content: `CUSTOMER CONVERSATION: "${conversationContent}"

TEAM MEMBER EXPERTISE:
${Object.entries(memberKeywords)
  .map(([id, keywords]) => `Team Member ID: ${id}\nExpertise Keywords: ${keywords.join(", ")}`)
  .join("\n")}

TASK:
Analyze the customer conversation and determine which team members have the expertise needed to best address this issue.

For each team member, evaluate if their expertise keywords semantically relate to the conversation's core problem - even if the exact terms don't appear in the text.

Return a JSON object with:
1. "matches": Record mapping team member IDs to boolean values (true if their expertise aligns with the conversation)
2. "reasoning": Brief explanation of your matching decisions
3. "confidenceScore": Number between 0-1 indicating overall confidence in your matching

Focus on understanding the customer's underlying needs rather than just surface-level keyword matching.`,
      },
    ],
    // 0.1 to allow some flexibility in matching, set to 0 to force more exact matches
    temperature: 0.1,
    functionId: "auto-assign-keyword-matching",
  });

  return {
    members: membersWithKeywords.filter((member) => result.matches[member.id]),
    aiResult: result,
  };
};

const getNextCoreTeamMemberInRotation = async (
  coreTeamMembers: UserWithMailboxAccessData[],
): Promise<UserWithMailboxAccessData | null> => {
  if (coreTeamMembers.length === 0) return null;

  const cache = cacheFor<number>(CACHE_ROUND_ROBIN_KEY_PREFIX);

  const lastAssignedIndex = (await cache.get()) ?? 0;
  const nextIndex = (lastAssignedIndex + 1) % coreTeamMembers.length;

  await cache.set(nextIndex);

  return coreTeamMembers[nextIndex] ?? null;
};

const getNextAssigneeFromIssueGroup = async (
  issueGroupId: number,
  teamMembers: UserWithMailboxAccessData[],
): Promise<{ member: UserWithMailboxAccessData | null; source: string }> => {
  const issueGroup = await db.query.issueGroups.findFirst({
    where: eq(issueGroups.id, issueGroupId),
  });

  if (!issueGroup?.assignees || issueGroup.assignees.length === 0) {
    console.log(
      `[Auto-Assign] Issue group ${issueGroupId} has no assignees configured (assignees: ${issueGroup?.assignees})`,
    );
    return { member: null, source: "no_issue_group_assignees" };
  }

  console.log(
    `[Auto-Assign] Issue group ${issueGroupId} has ${issueGroup.assignees.length} configured assignees: ${issueGroup.assignees.join(", ")}`,
  );

  // Filter to only active team members who are in the issue group's assignees list
  const availableAssignees = teamMembers.filter(
    (member) =>
      issueGroup.assignees?.includes(member.id) &&
      (member.role === UserRoles.CORE || member.role === UserRoles.NON_CORE),
  );

  console.log(
    `[Auto-Assign] Found ${availableAssignees.length} active assignees in issue group: ${availableAssignees.map((m) => `${m.displayName} (${m.id})`).join(", ")}`,
  );

  if (availableAssignees.length === 0) {
    return { member: null, source: "no_active_assignees_in_issue_group" };
  }

  // Use round-robin within the issue group
  const currentIndex = issueGroup.lastAssignedIndex ?? 0;
  const nextIndex = (currentIndex + 1) % availableAssignees.length;

  console.log(
    `[Auto-Assign] Round-robin: currentIndex=${currentIndex}, nextIndex=${nextIndex}, total=${availableAssignees.length}`,
  );

  // Update the lastAssignedIndex in the database
  await db.update(issueGroups).set({ lastAssignedIndex: nextIndex }).where(eq(issueGroups.id, issueGroupId));

  const selectedMember = availableAssignees[nextIndex];
  return {
    member: selectedMember ?? null,
    source: `issue_group_round_robin`,
  };
};

const getConversationContent = (conversationData: {
  messages?: {
    role: string;
    cleanedUpText?: string | null;
  }[];
  subject?: string | null;
}): string => {
  if (!conversationData?.messages || conversationData.messages.length === 0) {
    return conversationData.subject || "";
  }

  const userMessages = conversationData.messages
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.cleanedUpText || "")
    .filter(Boolean);

  const contentParts = [];
  if (conversationData.subject) {
    contentParts.push(conversationData.subject);
  }
  contentParts.push(...userMessages);

  return contentParts.join(" ");
};

const getNextTeamMember = async (
  teamMembers: UserWithMailboxAccessData[],
  conversation: Conversation,
  mailbox: Mailbox,
) => {
  const conversationContent = getConversationContent(conversation);
  const { members: matchingNonCoreMembers, aiResult } = await getNonCoreTeamMembersWithMatchingKeywords(
    teamMembers,
    conversationContent,
    mailbox,
  );

  if (matchingNonCoreMembers.length > 0) {
    const randomIndex = Math.floor(Math.random() * matchingNonCoreMembers.length);
    const selectedMember = matchingNonCoreMembers[randomIndex]!;
    return { member: selectedMember, aiResult };
  }

  const coreMembers = getCoreTeamMembers(teamMembers);
  return {
    member: await getNextCoreTeamMemberInRotation(coreMembers),
  };
};

const getPreviousEmailConversationAssignee = async (
  conversation: Conversation & {
    messages?: {
      role: string;
      cleanedUpText?: string | null;
    }[];
  },
  activeTeamMembers: UserWithMailboxAccessData[],
) => {
  if (conversation.source !== "email" || !conversation.emailFrom) {
    return null;
  }

  // Only reuse assignee for genuinely new conversations (first customer message).
  if ((conversation.messages?.length ?? 0) > 1) {
    return null;
  }

  const previousConversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.source, "email"),
      eq(conversations.emailFrom, conversation.emailFrom),
      isNotNull(conversations.assignedToId),
      isNull(conversations.mergedIntoId),
      ne(conversations.id, conversation.id),
    ),
    columns: {
      id: true,
      assignedToId: true,
    },
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!previousConversation?.assignedToId) {
    return null;
  }

  const assignee = activeTeamMembers.find((member) => member.id === previousConversation.assignedToId);
  if (!assignee) {
    return null;
  }

  return {
    member: assignee,
    previousConversationId: previousConversation.id,
  };
};

export const autoAssignConversation = async ({ conversationId }: { conversationId: number }) => {
  console.log(`[Auto-Assign] 🎯 Starting auto-assign for conversation ${conversationId}`);

  const conversation = assertDefinedOrRaiseNonRetriableError(
    await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      with: {
        messages: {
          columns: {
            role: true,
            cleanedUpText: true,
          },
        },
      },
    }),
  );

  console.log(
    `[Auto-Assign] Conversation details - ID: ${conversation.id}, IssueGroupId: ${conversation.issueGroupId ?? "none"}, Subject: ${conversation.subject}`,
  );

  const mailbox = assertDefinedOrRaiseNonRetriableError(await getMailbox());
  const teamMembers = assertDefinedOrRaiseNonRetriableError(await getUsersWithMailboxAccess());

  console.log(`[Auto-Assign] Found ${teamMembers.length} total team members`);

  const activeTeamMembers = teamMembers.filter(
    (member) => member.role === UserRoles.CORE || member.role === UserRoles.NON_CORE,
  );

  console.log(
    `[Auto-Assign] Active team members: ${activeTeamMembers.length} (Core: ${activeTeamMembers.filter((m) => m.role === UserRoles.CORE).length}, Non-Core: ${activeTeamMembers.filter((m) => m.role === UserRoles.NON_CORE).length})`,
  );

  if (activeTeamMembers.length === 0) {
    console.log("[Auto-Assign] ❌ No active team members available");
    return { message: "Skipped: no active team members available for assignment" };
  }

  let nextTeamMember: UserWithMailboxAccessData | null = null;
  let assignmentSource = "unknown";
  let aiResult: any = undefined;

  // First priority: Check if conversation has an issue group with assignees
  if (conversation.issueGroupId) {
    console.log(
      `[Auto-Assign] 📋 Conversation has issue group ID: ${conversation.issueGroupId}, checking assignees...`,
    );
    const { member, source } = await getNextAssigneeFromIssueGroup(conversation.issueGroupId, activeTeamMembers);
    if (member) {
      nextTeamMember = member;
      assignmentSource = source;

      console.log(
        `[Auto-Assign] ✓ Found assignee from issue group: ${member.displayName} (${member.id}) via ${source}`,
      );
    } else {
      console.log(`[Auto-Assign] ⚠️ Issue group has no available assignees (source: ${source}), falling back...`);
    }
  } else {
    console.log("[Auto-Assign] No issue group assigned, will use keyword matching or round-robin");
  }

  // Second priority: Fall back to keyword matching and round-robin
  if (!nextTeamMember) {
    console.log("[Auto-Assign] 🔍 Attempting keyword matching or round-robin...");
    const previousEmailAssignee = await getPreviousEmailConversationAssignee(conversation, activeTeamMembers);
    if (previousEmailAssignee) {
      nextTeamMember = previousEmailAssignee.member;
      assignmentSource = "previous_email_assignee";
      console.log(
        `[Auto-Assign] ✓ Reusing assignee ${nextTeamMember.displayName} (${nextTeamMember.id}) from previous conversation ${previousEmailAssignee.previousConversationId}`,
      );
    } else {
      const result = await getNextTeamMember(activeTeamMembers, conversation, mailbox);
      nextTeamMember = result.member;
      aiResult = result.aiResult;
      assignmentSource = aiResult ? "keyword_matching" : "core_round_robin";
    }

    console.log(
      `[Auto-Assign] ${nextTeamMember ? "✓" : "❌"} Result from ${assignmentSource}: ${nextTeamMember ? `${nextTeamMember.displayName} (${nextTeamMember.id})` : "no match"}`,
    );
  }

  if (!nextTeamMember) {
    console.log("[Auto-Assign] ❌ Failed to find any suitable team member");
    return {
      message: "Skipped: could not find suitable team member for assignment",
      details: "No core members and no matching keywords for non-core members",
    };
  }

  console.log(
    `[Auto-Assign] 🎉 Assigning conversation ${conversation.id} to ${nextTeamMember.displayName} (${nextTeamMember.id}) via ${assignmentSource}`,
  );

  await updateConversation(conversation.id, {
    set: { assignedToId: nextTeamMember.id },
    message: aiResult
      ? aiResult.reasoning
      : assignmentSource === "issue_group_round_robin"
        ? `Assigned from issue group (round-robin)`
        : assignmentSource === "previous_email_assignee"
          ? "Assigned to same staff member as previous email conversation"
        : "Core member assigned by round robin",
  });

  console.log(`[Auto-Assign] ✓ Successfully assigned conversation ${conversation.id}`);

  // Trigger template response check after assignment
  await triggerEvent("conversations/template-response.check", {
    conversationId: conversation.id,
  });

  return {
    message: `Assigned conversation ${conversation.id} to ${nextTeamMember.displayName} (${nextTeamMember.id})`,
    assigneeRole: nextTeamMember.role,
    assigneeId: nextTeamMember.id,
    assignmentSource,
    aiResult,
  };
};
