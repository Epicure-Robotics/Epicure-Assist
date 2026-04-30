import { FilterButton } from "@/components/ui/filter-button";
import { api } from "@/trpc/react";

interface UnreadMessagesFilterProps {
  hasUnreadMessages: boolean | undefined;
  onChange: (hasUnreadMessages: boolean | undefined) => void;
}

export const UnreadMessagesFilter = ({ hasUnreadMessages, onChange }: UnreadMessagesFilterProps) => {
  const { data: openCounts } = api.mailbox.openCount.useQuery();

  return (
    <FilterButton
      isActive={!!hasUnreadMessages}
      label="Unread"
      count={openCounts?.openUnread}
      onClick={() => onChange(hasUnreadMessages ? undefined : true)}
      className="whitespace-nowrap"
    />
  );
};
