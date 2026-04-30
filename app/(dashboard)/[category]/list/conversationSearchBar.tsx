import { capitalize } from "lodash-es";
import { ArrowDownUp, Filter, Search } from "lucide-react";
import { useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useAlternateHotkeyInEditor } from "@/app/(dashboard)/[category]/conversation/messageActions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterButton } from "@/components/ui/filter-button";
import { Input } from "@/components/ui/input";
import { useDebouncedCallback } from "@/components/useDebouncedCallback";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import { useConversationsListInput } from "../shared/queries";

type StatusOption = "all" | "open" | "waiting_on_customer" | "closed" | "spam" | "check_back_later" | "ignored";
type SortOption = "oldest" | "newest" | "highest_value";

interface ConversationSearchBarProps {
  toggleAllConversations: () => void;
  allConversationsSelected: boolean;
  activeFilterCount: number;
  defaultSort: string | undefined;
  supportsHighestValueSort: boolean;
  showFilters: boolean;
  setShowFilters: (showFilters: boolean) => void;
  conversationCount: number;
}

export const ConversationSearchBar = ({
  toggleAllConversations,
  allConversationsSelected,
  activeFilterCount,
  defaultSort,
  supportsHighestValueSort,
  showFilters,
  setShowFilters,
  conversationCount,
}: ConversationSearchBarProps) => {
  const { input, searchParams, setSearchParams } = useConversationsListInput();
  const [, setId] = useQueryState("id");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState(searchParams.search || "");

  const { data: openCount } = api.mailbox.openCount.useQuery();

  // Calculate total count for "All" option
  const totalCount = openCount
    ? openCount.open[input.category] +
      openCount.waiting_on_customer[input.category] +
      openCount.closed[input.category] +
      openCount.spam[input.category] +
      openCount.check_back_later[input.category] +
      openCount.ignored[input.category]
    : 0;

  const status = openCount
    ? [
        { status: "all" as const, count: totalCount },
        { status: "open" as const, count: openCount.open[input.category] },
        { status: "waiting_on_customer" as const, count: openCount.waiting_on_customer[input.category] },
        { status: "closed" as const, count: openCount.closed[input.category] },
        { status: "spam" as const, count: openCount.spam[input.category] },
        { status: "check_back_later" as const, count: openCount.check_back_later[input.category] },
        { status: "ignored" as const, count: openCount.ignored[input.category] },
      ]
    : [];

  const debouncedSetSearch = useDebouncedCallback((val: string) => {
    setSearchParams({ search: val || null });
    searchInputRef.current?.focus();
  }, 300);

  useEffect(() => {
    debouncedSetSearch(search);
  }, [search]);

  useHotkeys("mod+k", (e) => {
    e.preventDefault();
    searchInputRef.current?.focus();
  });

  useAlternateHotkeyInEditor("f", "mod+shift+f", () => {
    setShowFilters(!showFilters);
  });

  const effectiveDefaultSort = defaultSort ?? "oldest";
  const handleStatusFilterChange = useCallback(
    (status: StatusOption) => {
      setId(null);
      setSearchParams({ status });
    },
    [setId, setSearchParams],
  );

  const handleSortChange = useCallback(
    (sort: SortOption) => {
      setSearchParams({ sort });
      setId(null);
    },
    [setId, setSearchParams],
  );

  const statusOptions = useMemo(() => {
    const statuses = status.map((s) => {
      let label = "";
      if (s.status === "all") {
        label = s.count ? `${s.count} total` : "All";
      } else if (s.status === "waiting_on_customer") {
        label = s.count ? `${s.count} waiting on user` : "Waiting on user";
      } else if (s.status === "check_back_later") {
        label = s.count ? `${s.count} check back later` : "Check back later";
      } else if (s.count) {
        label = `${s.count} ${s.status}`;
      } else {
        label = capitalize(s.status);
      }

      return {
        value: s.status as StatusOption,
        label,
        selected: searchParams.status === s.status || (!searchParams.status && s.status === "open"),
      };
    });

    if (searchParams.status && !statuses.some((s) => s.value === searchParams.status)) {
      statuses.push({
        value: searchParams.status as StatusOption,
        label: capitalize(searchParams.status),
        selected: true,
      });
    }

    return statuses;
  }, [status, searchParams]);

  const sortOptions = useMemo(() => {
    const options: { value: SortOption; label: string; selected: boolean }[] = [];

    if (supportsHighestValueSort) {
      options.push({
        value: "highest_value",
        label: "Highest Value",
        selected: searchParams.sort === "highest_value",
      });
    }

    options.push(
      {
        value: "oldest",
        label: "Oldest",
        selected: searchParams.sort ? searchParams.sort === "oldest" : effectiveDefaultSort === "oldest",
      },
      {
        value: "newest",
        label: "Newest",
        selected: searchParams.sort ? searchParams.sort === "newest" : effectiveDefaultSort === "newest",
      },
    );

    return options;
  }, [effectiveDefaultSort, searchParams.sort, supportsHighestValueSort]);

  return (
    <div className="flex items-center justify-between gap-2 md:gap-6 py-0.5">
      <div className="flex items-center gap-2">
        {statusOptions.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <FilterButton
                isActive={
                  statusOptions.find(({ selected }) => selected)?.value !== "open" &&
                  statusOptions.find(({ selected }) => selected)?.value !== "all"
                }
                label={
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "size-2 rounded-full",
                        statusOptions.find(({ selected }) => selected)?.value === "all"
                          ? "bg-purple-500"
                          : statusOptions.find(({ selected }) => selected)?.value === "open"
                            ? "bg-success"
                            : statusOptions.find(({ selected }) => selected)?.value === "waiting_on_customer"
                              ? "bg-amber-500"
                              : statusOptions.find(({ selected }) => selected)?.value === "closed"
                                ? "bg-muted-foreground"
                                : statusOptions.find(({ selected }) => selected)?.value === "spam"
                                  ? "bg-destructive"
                                  : statusOptions.find(({ selected }) => selected)?.value === "check_back_later"
                                    ? "bg-blue-500"
                                    : statusOptions.find(({ selected }) => selected)?.value === "ignored"
                                      ? "bg-slate-400"
                                      : "bg-muted",
                      )}
                    />
                    <span>{statusOptions.find(({ selected }) => selected)?.label}</span>
                  </div>
                }
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={statusOptions.find(({ selected }) => selected)?.value || ""}
                onValueChange={(val) => handleStatusFilterChange(val as StatusOption)}
              >
                {statusOptions.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : statusOptions[0] ? (
          <div className="text-sm font-medium text-foreground">{statusOptions[0].label}</div>
        ) : null}
        {conversationCount > 0 && (
          <FilterButton
            className="hidden md:flex"
            onClick={() => toggleAllConversations()}
            isActive={allConversationsSelected}
            label={allConversationsSelected ? "Select none" : "Select all"}
          />
        )}
      </div>
      <div className="flex-1 max-w-[400px] flex items-center gap-2">
        <Input
          ref={searchInputRef}
          placeholder="Search conversations"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 h-8 rounded-full text-sm"
          iconsPrefix={<Search className="ml-1 h-4 w-4 text-foreground" />}
          autoFocus
        />
        <FilterButton
          isActive={showFilters}
          onClick={() => setShowFilters(!showFilters)}
          icon={Filter}
          label="Filters"
          count={activeFilterCount > 0 ? activeFilterCount : undefined}
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <FilterButton
            isActive={(sortOptions.find(({ selected }) => selected)?.value || "oldest") !== "oldest"}
            icon={ArrowDownUp}
            label={sortOptions.find(({ selected }) => selected)?.label}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={sortOptions.find(({ selected }) => selected)?.value || ""}
            onValueChange={(val) => handleSortChange(val as SortOption)}
          >
            {sortOptions.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
