import { User } from "lucide-react";
import type { CommandGroup } from "./types";

type AssigneesPageProps = {
  orgMembers: { id: string; displayName: string }[] | undefined;
  currentUserId: string | undefined;
  onAssignTicket?: (assignedTo: { id: string; displayName: string } | null) => void;
  onOpenChange: (open: boolean) => void;
};

export const useAssigneesPage = ({
  orgMembers,
  currentUserId,
  onAssignTicket,
  onOpenChange,
}: AssigneesPageProps): CommandGroup[] => [
  {
    heading: "Assignees",
    items: [
      {
        id: "unassign",
        label: "Unassign",
        icon: User,
        onSelect: () => {
          if (onAssignTicket) {
            onAssignTicket(null);
            onOpenChange(false);
          }
        },
      },
      ...(orgMembers?.map((member) => ({
        id: member.id,
        label: `${member.displayName}${member.id === currentUserId ? " (You)" : ""}`,
        icon: User,
        onSelect: () => {
          if (onAssignTicket) {
            onAssignTicket(member);
            onOpenChange(false);
          }
        },
      })) || []),
    ],
  },
];
