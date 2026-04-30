import { toast } from "sonner";
import { useConversationContext } from "@/app/(dashboard)/[category]/conversation/conversationContext";
import { useConversationListContext } from "@/app/(dashboard)/[category]/list/conversationListContext";
import { useConversationsListInput } from "@/app/(dashboard)/[category]/shared/queries";
import { api } from "@/trpc/react";

export const useAssignTicket = () => {
  const utils = api.useUtils();
  const { input } = useConversationsListInput();
  const { currentConversationSlug, conversationListData, removeConversation } = useConversationListContext();
  const { updateConversation } = useConversationContext();

  const assignTicket = (assignedTo: { id: string; displayName: string } | null, message?: string | null) => {
    const assignedToId = assignedTo ? assignedTo.id : null;
    updateConversation({ assignedToId, message });

    utils.mailbox.conversations.list.setInfiniteData(input, (data) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          conversations: page.conversations.map((c) =>
            c.slug === currentConversationSlug ? { ...c, assignedToId } : c,
          ),
        })),
      };
    });
    toast.success(assignedTo ? `Assigned ${assignedTo.displayName}` : "Unassigned ticket");
    if (
      (input.category === "mine" && assignedToId !== conversationListData?.assignedToIds?.[0]) ||
      (input.category === "unassigned" && assignedToId) ||
      (input.category === "assigned" && !assignedToId)
    ) {
      removeConversation({ moveToNext: false });
    }
  };

  const toggleAI = (enabled: boolean) => {
    updateConversation({ assignedToAI: enabled });
    utils.mailbox.conversations.list.setInfiniteData(input, (data) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          conversations: page.conversations.map((c) =>
            c.slug === currentConversationSlug ? { ...c, assignedToAI: enabled } : c,
          ),
        })),
      };
    });
    toast.success(enabled ? "AI Auto-Response Enabled" : "AI Auto-Response Disabled");
  };

  return { assignTicket, toggleAI };
};
