import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useConversationListContext } from "@/app/(dashboard)/[category]/list/conversationListContext";
import { assertDefined } from "@/components/utils/assert";
import { captureExceptionAndThrowIfDevelopment } from "@/lib/shared/sentry";
import { RouterInputs, RouterOutputs } from "@/trpc";
import { api } from "@/trpc/react";

type ConversationContextType = {
  conversationSlug: string;
  data: RouterOutputs["mailbox"]["conversations"]["get"] | null;
  isPending: boolean;
  error: { message: string } | null;
  refetch: () => void;
  updateStatus: (
    status: "closed" | "waiting_on_customer" | "spam" | "open" | "check_back_later" | "ignored",
  ) => Promise<void>;
  updateConversation: (inputs: Partial<RouterInputs["mailbox"]["conversations"]["update"]>) => Promise<void>;
  isUpdating: boolean;
};

const ConversationContext = createContext<ConversationContextType | null>(null);

export function useConversationQuery(conversationSlug: string | null) {
  const utils = api.useUtils();
  const hasMarkedAsRead = useRef<string | null>(null);

  const { mutate: markAsRead, isPending: isMarkingAsRead } = api.mailbox.conversations.markAsRead.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.mailbox.conversations.list.invalidate(),
        utils.mailbox.conversations.listWithPreview.invalidate(),
        utils.mailbox.conversations.count.invalidate(),
      ]);
    },
  });

  const result = api.mailbox.conversations.get.useQuery(
    {
      conversationSlug: conversationSlug ?? "",
    },
    {
      enabled: !!conversationSlug,
    },
  );

  // Mark conversation as read as soon as it loads (user opened it)
  useEffect(() => {
    if (
      result?.data &&
      conversationSlug &&
      !result.isPending &&
      !isMarkingAsRead &&
      hasMarkedAsRead.current !== conversationSlug
    ) {
      hasMarkedAsRead.current = conversationSlug;
      markAsRead({ conversationSlug });
    }
  }, [conversationSlug, result?.isPending, markAsRead, isMarkingAsRead]);

  // Reset the ref when conversationSlug changes
  useEffect(() => {
    if (hasMarkedAsRead.current !== conversationSlug) {
      hasMarkedAsRead.current = null;
    }
  }, [conversationSlug]);

  return conversationSlug ? result : null;
}

export const ConversationContextProvider = ({ children }: { children: React.ReactNode }) => {
  const { currentConversationSlug, removeConversation, navigateToConversation } = useConversationListContext();
  const conversationSlug = assertDefined(
    currentConversationSlug,
    "ConversationContext can only be used when currentConversationSlug is defined",
  );
  const { data = null, isPending, error, refetch } = assertDefined(useConversationQuery(currentConversationSlug));

  const utils = api.useUtils();
  const { mutateAsync: updateConversation, isPending: isUpdating } = api.mailbox.conversations.update.useMutation({
    onMutate: async (variables) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await utils.mailbox.conversations.get.cancel({ conversationSlug: variables.conversationSlug });

      const previousData = utils.mailbox.conversations.get.getData({
        conversationSlug: variables.conversationSlug,
      });

      // Optimistically update conversation data
      if (previousData) {
        const updatedData = { ...previousData };

        // Update status if provided
        if (variables.status) {
          updatedData.status = variables.status;
        }

        // Update assignment if provided
        if (variables.assignedToId !== undefined) {
          updatedData.assignedToId = variables.assignedToId;
        }
        if (variables.assignedToAI !== undefined) {
          updatedData.assignedToAI = variables.assignedToAI;
        }

        utils.mailbox.conversations.get.setData({ conversationSlug: variables.conversationSlug }, updatedData);

        // Optimistically update conversation list cache as well
        utils.mailbox.conversations.list.setInfiniteData({ status: ["open"] }, (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              conversations: page.conversations.map((c) =>
                c.slug === variables.conversationSlug
                  ? {
                      ...c,
                      ...(variables.status && { status: variables.status }),
                      ...(variables.assignedToId !== undefined && { assignedToId: variables.assignedToId }),
                      ...(variables.assignedToAI !== undefined && { assignedToAI: variables.assignedToAI }),
                    }
                  : c,
              ),
            })),
          };
        });
      }

      return { previousData };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        utils.mailbox.conversations.get.setData({ conversationSlug: variables.conversationSlug }, context.previousData);
      }

      toast.error("Error updating conversation", {
        description: error.message,
      });
    },
    onSuccess: (_data, variables) => {
      // Invalidate to ensure we have the latest data from server
      utils.mailbox.conversations.get.invalidate({
        conversationSlug: variables.conversationSlug,
      });
      utils.mailbox.conversations.list.invalidate();
      utils.mailbox.openCount.invalidate();
    },
  });

  const update = async (inputs: Partial<RouterInputs["mailbox"]["conversations"]["update"]>) => {
    await updateConversation({ conversationSlug, ...inputs });
  };

  const updateStatus = useCallback(
    async (status: "closed" | "waiting_on_customer" | "spam" | "open" | "check_back_later" | "ignored") => {
      const previousStatus = data?.status;

      if (status === "open") {
        await update({ status });
        toast.success("Conversation reopened");
        return;
      }

      // Navigate away immediately — don't wait for the API round-trip
      removeConversation();

      // Fire the API update without awaiting (optimistic updates already applied in onMutate)
      update({ status });

      if (status === "waiting_on_customer") {
        toast.success("Marked as waiting on user");
      } else if (status === "check_back_later") {
        toast.success("Marked as check back later");
      } else if (status === "ignored") {
        toast.success("Conversation ignored");
      } else if (status === "closed") {
        toast.success("Conversation closed", {
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await update({ status: previousStatus ?? "open" });
                navigateToConversation(conversationSlug);
                toast.success("Conversation reopened");
              } catch (e) {
                captureExceptionAndThrowIfDevelopment(e);
                toast.error("Failed to undo");
              }
            },
          },
        });
      }

      if (status === "spam") {
        const undoStatus = previousStatus ?? "open";
        toast.info("Marked as spam", {
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await update({ status: undoStatus });
                navigateToConversation(conversationSlug);
                toast.success("No longer marked as spam");
              } catch (e) {
                captureExceptionAndThrowIfDevelopment(e);
                toast.error("Failed to undo");
              }
            },
          },
        });
      }
    },
    [update, removeConversation, navigateToConversation, conversationSlug, data],
  );

  return (
    <ConversationContext.Provider
      value={{
        conversationSlug,
        data,
        isPending,
        error,
        refetch,
        updateStatus,
        updateConversation: update,
        isUpdating,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
};

export const useConversationContext = () =>
  assertDefined(
    useContext(ConversationContext),
    "useConversationContext must be used within a ConversationContextProvider",
  );
