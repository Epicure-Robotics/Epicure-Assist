import { Layers } from "lucide-react";
import { memo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterButton } from "@/components/ui/filter-button";
import { api } from "@/trpc/react";

export const IssueGroupFilter = memo(function IssueGroupFilter({
  issueGroupId,
  isClassified,
  onChange,
}: {
  issueGroupId: number | null;
  isClassified: boolean | undefined;
  onChange: (issueGroupId: number | null, isClassified: boolean | undefined) => void;
}) {
  const { data: issueGroups, isLoading, isError } = api.mailbox.issueGroups.listAll.useQuery();
  const { data: openCounts } = api.mailbox.openCount.useQuery();

  const selectedGroup = issueGroups?.groups.find((group) => group.id === issueGroupId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <FilterButton
          isActive={!!(issueGroupId || isClassified !== undefined)}
          icon={Layers}
          label={
            selectedGroup
              ? selectedGroup.title
              : isClassified === true
                ? "Classified"
                : isClassified === false
                  ? "Unclassified"
                  : "Category"
          }
          count={
            selectedGroup
              ? selectedGroup.conversationCount
              : isClassified === true
                ? openCounts?.openClassified
                : isClassified === false
                  ? openCounts?.openUnclassified
                  : undefined
          }
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-xs">
        <DropdownMenuRadioGroup
          value={isClassified !== undefined ? `isClassified:${isClassified}` : (issueGroupId?.toString() ?? "all")}
          onValueChange={(value) => {
            if (value === "all") {
              onChange(null, undefined);
            } else if (value.startsWith("isClassified:")) {
              const isClassifiedValue = value.split(":")[1] === "true";
              onChange(null, isClassifiedValue);
            } else {
              const numValue = parseInt(value, 10);
              if (!isNaN(numValue)) {
                onChange(numValue, undefined);
              }
            }
          }}
          className="flex flex-col"
        >
          <DropdownMenuRadioItem value="all">Open conversations ({openCounts?.open.all ?? 0})</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="isClassified:true">
            Classified ({openCounts?.openClassified ?? 0})
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="isClassified:false">
            Unclassified ({openCounts?.openUnclassified ?? 0})
          </DropdownMenuRadioItem>
          {isLoading ? (
            <DropdownMenuRadioItem value="loading" disabled>
              Loading...
            </DropdownMenuRadioItem>
          ) : isError ? (
            <DropdownMenuRadioItem value="error" disabled>
              <span className="text-red-500">Failed to load categories</span>
            </DropdownMenuRadioItem>
          ) : issueGroups?.groups.length === 0 ? (
            <DropdownMenuRadioItem value="empty" disabled>
              No categories found
            </DropdownMenuRadioItem>
          ) : (
            issueGroups?.groups.map((group) => (
              <DropdownMenuRadioItem key={group.id} value={group.id.toString()}>
                <div className="flex items-center gap-2 overflow-hidden w-full">
                  <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: group.color || "gray" }} />
                  <span className="truncate flex-1">{group.title}</span>
                  <span className="text-muted-foreground text-xs">({group.conversationCount})</span>
                </div>
              </DropdownMenuRadioItem>
            ))
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
