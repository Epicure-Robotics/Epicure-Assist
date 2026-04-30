import { Archive, Ban, Forward, Mail, RotateCcw, Send, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { ConversationListItem as ConversationItem } from "@/app/types/global";
import { AssigneeOption, AssignSelect } from "@/components/assignSelect";
import { ConfirmationDialog } from "@/components/confirmationDialog";
import HumanizedTime from "@/components/humanizedTime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FilterButton } from "@/components/ui/filter-button";
import { Tooltip, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSelected } from "@/components/useSelected";
import { useSession } from "@/components/useSession";
import { useShiftSelected } from "@/components/useShiftSelected";
import { conversationsListChannelId } from "@/lib/realtime/channels";
import { useRealtimeEvent } from "@/lib/realtime/hooks";
import { generateSlug } from "@/lib/shared/slug";
import { api } from "@/trpc/react";
import { useConversationsListInput } from "../shared/queries";
import { BulkForwardDialog } from "./bulkForwardDialog";
import { ConversationFilters, useConversationFilters } from "./conversationFilters";
import { useConversationListContext } from "./conversationListContext";
import { ConversationListItem } from "./conversationListItem";
import { ConversationListSkeleton } from "./conversationListSkeleton";
import { ConversationSearchBar } from "./conversationSearchBar";
import { NoConversations } from "./emptyState";
import NewConversationModalContent from "./newConversationModal";

type ListItem = ConversationItem & { isNew?: boolean };

export const List = () => {
  const { user } = useSession() ?? {};
  const { searchParams, input } = useConversationsListInput();
  const {
    conversationListData,
    navigateToConversation,
    isPending,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useConversationListContext();

  const [showFilters, setShowFilters] = useState(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("conversationFiltersVisible") ?? "false") === "true";
    }
    return false;
  });
  const { filterValues, activeFilterCount, updateFilter, clearFilters } = useConversationFilters();

  useEffect(() => {
    localStorage.setItem("conversationFiltersVisible", String(showFilters));
  }, [showFilters]);
  const [allConversationsSelected, setAllConversationsSelected] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [hoveredConversation, setHoveredConversation] = useState<ListItem | null>(null);
  const utils = api.useUtils();
  const { mutate: bulkUpdate } = api.mailbox.conversations.bulkUpdate.useMutation({
    onError: (err) => {
      toast.error("Failed to update conversations", { description: err.message });
    },
  });

  const conversations = conversationListData?.conversations ?? [];
  const defaultSort = conversationListData?.defaultSort;
  const supportsHighestValueSort = conversationListData?.supportsHighestValueSort ?? false;

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  const {
    selected: selectedConversations,
    change: changeSelectedConversations,
    clear: clearSelectedConversations,
    set: setSelectedConversations,
  } = useSelected<number>([]);

  const onShiftSelectConversation = useShiftSelected<number>(
    conversations.map((c) => c.id),
    changeSelectedConversations,
  );

  const toggleConversation = (id: number, isSelected: boolean, shiftKey: boolean) => {
    if (allConversationsSelected) {
      // If all conversations are selected, toggle the selected conversation
      setAllConversationsSelected(false);
      setSelectedConversations(conversations.flatMap((c) => (c.id === id ? [] : [c.id])));
    } else {
      onShiftSelectConversation(id, isSelected, shiftKey);
    }
  };

  const toggleAllConversations = (forceValue?: boolean) => {
    setAllConversationsSelected((prev) => forceValue ?? !prev);
    clearSelectedConversations();
  };

  const handleBulkUpdate = (
    status: "open" | "waiting_on_customer" | "closed" | "spam" | "check_back_later" | "ignored",
  ) => {
    setIsBulkUpdating(true);
    try {
      const conversationFilter = allConversationsSelected
        ? conversations.length <= 25 && !hasNextPage
          ? conversations.map((c) => c.id)
          : input
        : selectedConversations;

      bulkUpdate(
        {
          conversationFilter,
          status,
        },
        {
          onSuccess: ({ updatedImmediately }) => {
            setAllConversationsSelected(false);
            clearSelectedConversations();
            void utils.mailbox.conversations.list.invalidate();
            void utils.mailbox.conversations.count.invalidate();

            if (updatedImmediately) {
              const ticketsText = allConversationsSelected
                ? "All matching tickets"
                : `${selectedConversations.length} ticket${selectedConversations.length === 1 ? "" : "s"}`;

              const actionText = status === "open" ? "reopened" : status === "closed" ? "closed" : "marked as spam";
              toast.success(`${ticketsText} ${actionText}`);
            } else {
              toast.success("Starting update, refresh to see status.");
            }
          },
        },
      );
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkAssign = (assignee: AssigneeOption | null) => {
    setIsBulkUpdating(true);
    try {
      const conversationFilter = allConversationsSelected
        ? conversations.length <= 25 && !hasNextPage
          ? conversations.map((c) => c.id)
          : input
        : selectedConversations;

      const assignedToId = assignee && "id" in assignee ? assignee.id : null;
      const assignedToAI = !!(assignee && "ai" in assignee);

      bulkUpdate(
        {
          conversationFilter,
          assignedToId,
          assignedToAI,
        },
        {
          onSuccess: ({ updatedImmediately }) => {
            setAllConversationsSelected(false);
            clearSelectedConversations();
            void utils.mailbox.conversations.list.invalidate();
            void utils.mailbox.conversations.count.invalidate();

            if (updatedImmediately) {
              const ticketsText = allConversationsSelected
                ? "All matching tickets"
                : `${selectedConversations.length} ticket${selectedConversations.length === 1 ? "" : "s"}`;

              const assigneeName =
                assignee && "displayName" in assignee
                  ? assignee.displayName
                  : assignee && "ai" in assignee
                    ? "Helper agent"
                    : "Unassigned";
              toast.success(`${ticketsText} assigned to ${assigneeName}`);
            } else {
              toast.success("Starting update, refresh to see assignment.");
            }
          },
        },
      );
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const [pendingBulkAssignee, setPendingBulkAssignee] = useState<AssigneeOption | null>(null);

  useEffect(() => {
    if (!pendingBulkAssignee) return;

    const count = allConversationsSelected ? "all matching" : selectedConversations.length;
    const assigneeName =
      "id" in pendingBulkAssignee
        ? pendingBulkAssignee.displayName
        : "ai" in pendingBulkAssignee
          ? "Helper agent"
          : "Unassigned";

    if (allConversationsSelected || selectedConversations.length > 1) {
      const confirmed = window.confirm(`Are you sure you want to assign ${count} tickets to ${assigneeName}?`);
      if (confirmed) {
        handleBulkAssign(pendingBulkAssignee);
      }
    } else {
      handleBulkAssign(pendingBulkAssignee);
    }
    setPendingBulkAssignee(null);
  }, [pendingBulkAssignee, allConversationsSelected, selectedConversations.length]);

  useEffect(() => {
    const currentRef = loadMoreRef.current;
    if (!currentRef || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "500px", root: resultsContainerRef.current },
    );

    observer.observe(currentRef);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useHotkeys("mod+a", () => toggleAllConversations(true), {
    enableOnFormTags: false,
    preventDefault: true,
  });

  // Clear selections when status filter changes
  useEffect(() => {
    toggleAllConversations(false);
  }, [searchParams.status, clearSelectedConversations]);

  useRealtimeEvent(conversationsListChannelId(), "conversation.new", (message) => {
    const newConversation = message.data as ConversationItem;
    if (newConversation.status !== (searchParams.status ?? "open")) return;
    const sort = searchParams.sort ?? defaultSort;
    if (!sort) return;

    utils.mailbox.conversations.list.setInfiniteData(input, (data) => {
      if (!data) return undefined;
      const firstPage = data.pages[0];
      if (!firstPage) return data;

      switch (input.category) {
        case "all":
          break;
        case "assigned":
          if (!newConversation.assignedToId) return data;
          break;
        case "unassigned":
          if (newConversation.assignedToId) return data;
          break;
        case "mine":
          if (newConversation.assignedToId !== firstPage.assignedToIds?.[0]) return data;
          break;
      }

      const existingConversationIndex = firstPage.conversations.findIndex(
        (conversation) => conversation.slug === newConversation.slug,
      );

      const newConversations: ListItem[] = [...firstPage.conversations];
      if (existingConversationIndex >= 0) newConversations.splice(existingConversationIndex, 1);

      switch (sort) {
        case "newest":
          newConversations.unshift({ ...newConversation, isNew: true });
          break;
        case "oldest":
          // Only add to first page if no other pages exist
          if (data.pages.length === 1) {
            newConversations.push({ ...newConversation, isNew: true });
          }
          break;
        case "highest_value":
          const indexToInsert =
            existingConversationIndex >= 0
              ? existingConversationIndex
              : newConversations.findIndex(
                  (c) => (c.platformCustomer?.value ?? 0) < (newConversation.platformCustomer?.value ?? 0),
                );
          if (indexToInsert < 0) return data;
          newConversations.splice(indexToInsert, 0, { ...newConversation, isNew: true });
          break;
      }

      return {
        ...data,
        pages: [{ ...firstPage, conversations: newConversations }, ...data.pages.slice(1)],
      };
    });
  });

  const conversationsText = allConversationsSelected
    ? "all matching conversations"
    : `${selectedConversations.length} conversation${selectedConversations.length === 1 ? "" : "s"}`;

  return (
    <div className="flex w-full h-full">
      {/* Main conversation list */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        <div className="px-3 md:px-6 py-2 shrink-0 border-b border-border">
          <div className="flex flex-col gap-2">
            <ConversationSearchBar
              toggleAllConversations={toggleAllConversations}
              allConversationsSelected={allConversationsSelected}
              activeFilterCount={activeFilterCount}
              defaultSort={defaultSort}
              supportsHighestValueSort={supportsHighestValueSort}
              showFilters={showFilters}
              setShowFilters={setShowFilters}
              conversationCount={conversations.length}
            />
            {(allConversationsSelected || selectedConversations.length > 0) && (
              <div className="flex items-center justify-between gap-4 px-1 animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hidden">
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 mr-2">
                          <Badge variant="bright" className="text-xs font-bold rounded-sm px-1.5">
                            {allConversationsSelected ? "ALL" : selectedConversations.length}
                          </Badge>
                          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                            {allConversationsSelected ? "All matching" : "selected"}
                          </span>
                        </div>
                      </TooltipTrigger>
                    </Tooltip>
                  </TooltipProvider>

                  <div className="h-4 w-px bg-border mx-1 shrink-0" />

                  <div className="flex items-center gap-1">
                    {searchParams.status !== "open" && (
                      <ConfirmationDialog
                        message={`Are you sure you want to reopen ${conversationsText}?`}
                        onConfirm={() => handleBulkUpdate("open")}
                        confirmLabel="Yes, reopen"
                        confirmVariant="bright"
                      >
                        <FilterButton label="Reopen" icon={RotateCcw} disabled={isBulkUpdating} />
                      </ConfirmationDialog>
                    )}
                    {searchParams.status !== "closed" && (
                      <ConfirmationDialog
                        message={`Are you sure you want to close ${conversationsText}?`}
                        onConfirm={() => handleBulkUpdate("closed")}
                        confirmLabel="Yes, close"
                        confirmVariant="bright"
                      >
                        <FilterButton label="Close" icon={Archive} disabled={isBulkUpdating} />
                      </ConfirmationDialog>
                    )}

                    {searchParams.status !== "spam" && (
                      <ConfirmationDialog
                        message={`Are you sure you want to mark ${conversationsText} as spam?`}
                        onConfirm={() => handleBulkUpdate("spam")}
                        confirmLabel="Yes, mark as spam"
                        confirmVariant="bright"
                      >
                        <FilterButton label="Spam" icon={Ban} disabled={isBulkUpdating} />
                      </ConfirmationDialog>
                    )}
                    <BulkForwardDialog
                      conversationSlugs={
                        allConversationsSelected
                          ? conversations.map((c) => c.slug)
                          : conversations.filter((c) => selectedConversations.includes(c.id)).map((c) => c.slug)
                      }
                      onSuccess={() => {
                        setAllConversationsSelected(false);
                        clearSelectedConversations();
                      }}
                    >
                      <FilterButton label="Forward" icon={Forward} disabled={isBulkUpdating} />
                    </BulkForwardDialog>
                    <AssignSelect
                      onChange={setPendingBulkAssignee}
                      aiOption
                      trigger={<FilterButton label="Assign" icon={UserPlus} disabled={isBulkUpdating} />}
                    />
                  </div>
                </div>
              </div>
            )}
            {showFilters && (
              <ConversationFilters
                filterValues={filterValues}
                onUpdateFilter={updateFilter}
                onClearFilters={clearFilters}
                activeFilterCount={activeFilterCount}
              />
            )}
          </div>
        </div>
        {isPending || (isFetching && conversations.length === 0) ? (
          <div className="flex-1 px-4">
            <ConversationListSkeleton count={8} />
          </div>
        ) : conversations.length === 0 ? (
          <NoConversations filtered={activeFilterCount > 0 || !!input.search} onClearFilters={clearFilters} />
        ) : (
          <div ref={resultsContainerRef} className="flex-1 overflow-y-auto">
            {conversations.map((conversation) => (
              <ConversationListItem
                key={conversation.slug}
                conversation={conversation}
                onSelectConversation={navigateToConversation}
                isSelected={allConversationsSelected || selectedConversations.includes(conversation.id)}
                onToggleSelect={(isSelected, shiftKey) => toggleConversation(conversation.id, isSelected, shiftKey)}
                onHover={!user?.preferences?.disableHoverPreview ? setHoveredConversation : undefined}
                isHighlighted={hoveredConversation?.slug === conversation.slug}
              />
            ))}
            <div ref={loadMoreRef} />
            {isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <ConversationListSkeleton count={3} />
              </div>
            )}
          </div>
        )}
        <NewConversationModal />
      </div>

      {/* Preview Sidebar - fixed position like left sidebar */}
      {hoveredConversation && (
        <>
          {/* Spacer to prevent layout shift */}
          <div className="w-96 shrink-0" />
          {/* Fixed sidebar */}
          <div className="fixed right-0 inset-y-0 w-96 border-l border-border bg-background z-40 overflow-y-auto">
            <EmailPreviewSidebar conversation={hoveredConversation} onClose={() => setHoveredConversation(null)} />
          </div>
        </>
      )}
    </div>
  );
};

const EmailPreviewSidebar = ({ conversation, onClose }: { conversation: ListItem; onClose: () => void }) => {
  const displayEmailFrom = conversation.emailFrom ?? "Anonymous";
  const subject = conversation.subject
    .replace("World's First AI Thought Companion ", "")
    .replace(" Access to Pocket's Full Power", "")
    .replace(" Access to Pocket's Full Power", "")
    .replace(" (Launch Special)", "");

  // Fetch full conversation data with all messages
  const { data: fullConversation, isLoading } = api.mailbox.conversations.get.useQuery(
    { conversationSlug: conversation.slug },
    { staleTime: 30000 },
  );

  return (
    <div className="p-4 space-y-3 text-sm">
      {/* Header with sender info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent-foreground">
            <Mail className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{displayEmailFrom}</p>
            <p className="text-[10px] text-muted-foreground">
              <HumanizedTime time={conversation.lastMessageAt ?? conversation.updatedAt} />
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-lg"
          aria-label="Close preview"
        >
          ×
        </button>
      </div>

      {/* Subject */}
      <div>
        <p className="text-sm font-semibold text-foreground">{subject || "(no subject)"}</p>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-1.5">
        {conversation.status === "waiting_on_customer" && (
          <Badge variant="gray" className="text-[10px]">
            Waiting on user
          </Badge>
        )}
        {conversation.status === "check_back_later" && (
          <Badge variant="gray" className="text-[10px]">
            Check back later
          </Badge>
        )}
        {conversation.status === "closed" && (
          <Badge variant="gray" className="text-[10px]">
            Closed
          </Badge>
        )}
        {(conversation.unreadMessageCount ?? 0) > 0 && (
          <Badge variant="bright" className="text-[10px]">
            {conversation.unreadMessageCount} unread
          </Badge>
        )}
      </div>

      {/* Messages */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading messages...</div>
        ) : fullConversation?.messages?.length ? (
          fullConversation.messages
            .filter((m) => m.type === "message")
            .map((message) => (
              <div key={message.id} className="rounded-md bg-muted/50 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-medium text-foreground">
                    {"role" in message && message.role === "user" ? displayEmailFrom : "Support"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    <HumanizedTime time={message.createdAt} />
                  </span>
                </div>
                <div
                  className="text-xs text-muted-foreground prose prose-xs max-w-none"
                  dangerouslySetInnerHTML={{
                    __html:
                      ("cleanedUpText" in message && message.cleanedUpText) ||
                      ("body" in message && message.body) ||
                      "",
                  }}
                />
              </div>
            ))
        ) : (
          <div className="text-xs text-muted-foreground">No messages found</div>
        )}
      </div>
    </div>
  );
};

const NewConversationModal = () => {
  const [newConversationModalOpen, setNewConversationModalOpen] = useState(false);
  const [newConversationSlug, setNewConversationSlug] = useState(generateSlug());
  useEffect(() => {
    if (newConversationModalOpen) setNewConversationSlug(generateSlug());
  }, [newConversationModalOpen]);

  const closeModal = () => setNewConversationModalOpen(false);

  return (
    <Dialog open={newConversationModalOpen} onOpenChange={setNewConversationModalOpen}>
      <DialogTrigger asChild>
        <Button
          variant="default"
          iconOnly
          className="fixed z-50 bottom-6 right-6 rounded-full text-primary-foreground dark:bg-bright dark:text-bright-foreground bg-bright hover:bg-bright/90 hover:text-background"
          aria-label="New message"
        >
          <Send className="text-primary dark:text-primary-foreground h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
        </DialogHeader>
        <NewConversationModalContent conversationSlug={newConversationSlug} onSubmit={closeModal} />
      </DialogContent>
    </Dialog>
  );
};
