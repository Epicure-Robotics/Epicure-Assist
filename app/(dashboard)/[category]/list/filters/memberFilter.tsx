import { Check, LucideIcon } from "lucide-react";
import { useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { FilterButton } from "@/components/ui/filter-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMembers } from "@/components/useMembers";
import { api } from "@/trpc/react";

interface MemberFilterProps {
  selectedMembers: string[];
  onChange: (members: string[]) => void;
  icon: LucideIcon;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  singleSelectionDisplay?: (memberName: string) => string;
  multiSelectionDisplay?: (count: number) => string;
  includeUnassigned?: boolean;
}

export function MemberFilter({
  selectedMembers,
  onChange,
  icon: Icon,
  placeholder,
  searchPlaceholder,
  emptyText,
  singleSelectionDisplay = (name) => name,
  multiSelectionDisplay = (count) => `${count} selected`,
  includeUnassigned = false,
}: MemberFilterProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { data: members } = useMembers();
  const { data: openCounts } = api.mailbox.openCount.useQuery();

  const unassignedItem = {
    id: "unassigned",
    displayName: "Unassigned",
    openCount: openCounts?.open.unassigned ?? 0,
  };

  const allItems = [
    ...(includeUnassigned ? [unassignedItem] : []),
    ...(members?.map((m) => ({ ...m, openCount: (m as any).openCount ?? 0 })) ?? []),
  ];

  const filteredItems = allItems
    .filter((item) => item.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
    .toSorted((a, b) => {
      if (b.openCount !== a.openCount) {
        return b.openCount - a.openCount;
      }
      return a.displayName.localeCompare(b.displayName);
    });

  const singleMemberName =
    selectedMembers.length === 1
      ? selectedMembers[0] === "unassigned"
        ? "Unassigned"
        : members?.find((m) => m.id === selectedMembers[0])?.displayName
      : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterButton
          isActive={selectedMembers.length > 0}
          icon={Icon}
          label={
            selectedMembers.length === 1 && selectedMembers[0]
              ? singleSelectionDisplay(
                  selectedMembers[0] === "unassigned"
                    ? "Unassigned"
                    : (members?.find((m) => m.id === selectedMembers[0])?.displayName ?? ""),
                )
              : selectedMembers.length > 1
                ? multiSelectionDisplay(selectedMembers.length)
                : placeholder
          }
          count={
            selectedMembers.length === 1
              ? selectedMembers[0] === "unassigned"
                ? openCounts?.open.unassigned
                : (members?.find((m) => m.id === selectedMembers[0]) as any)?.openCount
              : undefined
          }
          title={singleMemberName}
        />
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={searchTerm} onValueChange={setSearchTerm} />
          <div className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filteredItems.map((item) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => {
                    const isSelected = selectedMembers.includes(item.id);
                    if (item.id === "unassigned") {
                      onChange(isSelected ? selectedMembers.filter((m) => m !== "unassigned") : ["unassigned"]);
                    } else {
                      onChange(
                        isSelected
                          ? selectedMembers.filter((m) => m !== item.id)
                          : [...selectedMembers.filter((m) => m !== "unassigned"), item.id],
                      );
                    }
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${selectedMembers.includes(item.id) ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="truncate flex-1">{item.displayName}</span>
                  <span className="text-muted-foreground text-xs">({item.openCount})</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
          {selectedMembers.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem onSelect={() => onChange([])} className="cursor-pointer justify-center">
                  Clear
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
