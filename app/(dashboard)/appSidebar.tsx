"use client";

import {
  BarChart,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Layers,
  Link as LinkIcon,
  MessageCircleReply,
  MessageSquareText,
  MonitorSmartphone,
  PanelLeft,
  Settings as SettingsIcon,
  Ticket,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { AccountDropdown } from "@/app/(dashboard)/accountDropdown";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useMembers } from "@/components/useMembers";
import { api } from "@/trpc/react";

declare global {
  interface Window {
    __unstable__onBeforeSetActive: () => void;
  }
}

const settingsItems = [
  { label: "Knowledge", id: "knowledge", icon: BookOpen },
  { label: "Team", id: "team", icon: Users },
  { label: "Common Issues", id: "common-issues", icon: Layers },
  { label: "Customers", id: "customers", icon: UserPlus },
  { label: "In-App Chat", id: "in-app-chat", icon: MonitorSmartphone },
  { label: "Integrations", id: "integrations", icon: LinkIcon },
  { label: "Mailbox", id: "mailbox", icon: Inbox },
  { label: "User preferences", id: "preferences", icon: SettingsIcon },
  { label: "Notifications", id: "notifications", icon: Bell },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const previousAppUrlRef = useRef<string | null>(null);
  const { data: openCounts } = api.mailbox.openCount.useQuery();
  const { data: mailbox } = api.mailbox.get.useQuery();
  const { data: pinnedIssues, error: issueGroupsError } = api.mailbox.issueGroups.pinnedList.useQuery();
  const { data: members } = useMembers();
  const isSettingsPage = pathname.startsWith(`/settings`);
  const { isMobile, setOpenMobile, toggleSidebar } = useSidebar();

  const currentIssueGroupId = searchParams.get("issueGroupId");
  const currentRepliedBy = searchParams.get("repliedBy");
  const [staffActivityExpanded, setStaffActivityExpanded] = useState(false);

  const handleItemClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar className="bg-sidebar text-sidebar-foreground" collapsible="icon">
      <SidebarHeader>
        {isSettingsPage ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="cursor-pointer"
                onClick={() => {
                  const fallback = `/mine`;
                  router.push(previousAppUrlRef.current || fallback);
                  handleItemClick();
                }}
                tooltip="Back to app"
              >
                <div className="flex items-center gap-2 h-10">
                  <ChevronLeft className="size-4" />
                  <span className="font-medium group-data-[collapsible=icon]:hidden">Back to app</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : (
          <div className="flex items-center justify-between gap-2 w-full h-10 px-2 rounded-lg">
            <span className="truncate text-base font-bold group-data-[collapsible=icon]:hidden">{mailbox?.name}</span>
            {/* Collapse button - visible when expanded */}
            <button
              onClick={toggleSidebar}
              className="p-1 px-1.5 hover:bg-slate-100 rounded-md text-slate-500 group-data-[collapsible=icon]:hidden transition-colors"
              title="Collapse sidebar"
            >
              <PanelLeft className="size-5" />
            </button>
            {/* Expand button - visible when collapsed */}
            <button
              onClick={toggleSidebar}
              className="hidden group-data-[collapsible=icon]:flex p-1.5 hover:bg-slate-100 rounded-md text-slate-500 transition-colors mx-auto"
              title="Expand sidebar"
            >
              <PanelLeft className="size-5" />
            </button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="flex flex-col h-full">
        {isSettingsPage ? (
          <>
            <SidebarGroup>
              <SidebarMenu>
                {settingsItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton asChild isActive={pathname === `/settings/${item.id}`} tooltip={item.label}>
                      <Link href={`/settings/${item.id}`} onClick={handleItemClick}>
                        <item.icon className="size-4" />
                        <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </>
        ) : (
          <>
            <div>
              <SidebarGroup>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === `/mine`} tooltip="Mine">
                      <Link href={`/mine`} onClick={handleItemClick}>
                        <User className="size-4" />
                        <span className="group-data-[collapsible=icon]:hidden">Mine</span>
                      </Link>
                    </SidebarMenuButton>
                    {openCounts && openCounts.mine > 0 && <SidebarMenuBadge>{openCounts.mine}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === `/assigned`} tooltip="Assigned">
                      <Link href={`/assigned`} onClick={handleItemClick}>
                        <Users className="size-4" />
                        <span className="group-data-[collapsible=icon]:hidden">Assigned</span>
                      </Link>
                    </SidebarMenuButton>
                    {openCounts && openCounts.assigned > 0 && (
                      <SidebarMenuBadge>{openCounts.assigned}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === `/unassigned`} tooltip="Up for grabs">
                      <Link href={`/unassigned`} onClick={handleItemClick}>
                        <Ticket className="size-4" />
                        <span className="group-data-[collapsible=icon]:hidden">Up for grabs</span>
                      </Link>
                    </SidebarMenuButton>
                    {openCounts && openCounts.unassigned > 0 && (
                      <SidebarMenuBadge>{openCounts.unassigned}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === `/all` && !currentIssueGroupId} tooltip="Open">
                      <Link href={`/all`} onClick={handleItemClick}>
                        <Inbox className="size-4" />
                        <span className="group-data-[collapsible=icon]:hidden">Open</span>
                      </Link>
                    </SidebarMenuButton>
                    {openCounts && openCounts.all > 0 && <SidebarMenuBadge>{openCounts.all}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarMenu>
                  {!issueGroupsError && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname === `/common-issues`} tooltip="Common issues">
                        <Link href={`/common-issues`} onClick={handleItemClick}>
                          <Layers className="size-4" />
                          <span className="group-data-[collapsible=icon]:hidden">Common issues</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === `/saved-replies`} tooltip="Saved replies">
                      <Link href={`/saved-replies`} onClick={handleItemClick}>
                        <MessageSquareText className="size-4" />
                        <span className="group-data-[collapsible=icon]:hidden">Saved replies</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>

              {!issueGroupsError && pinnedIssues && pinnedIssues.groups.length > 0 && (
                <SidebarGroup>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton className="text-xs font-medium text-sidebar-foreground/50 pointer-events-none">
                        Pinned issues
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {pinnedIssues.groups.slice(0, 5).map((group) => (
                      <SidebarMenuItem key={group.id}>
                        <SidebarMenuButton
                          asChild
                          tooltip={group.title}
                          isActive={pathname === `/all` && currentIssueGroupId === group.id.toString()}
                        >
                          <Link href={`/all?issueGroupId=${group.id}`} onClick={handleItemClick}>
                            <div
                              className="size-2 rounded-full shrink-0"
                              style={{ backgroundColor: group.color || "var(--sidebar-foreground)" }}
                            />
                            <span className="group-data-[collapsible=icon]:hidden truncate leading-tight">
                              {group.title.replace(/^\d+\s+/, "").length > 25
                                ? `${group.title.replace(/^\d+\s+/, "").substring(0, 25)}...`
                                : group.title.replace(/^\d+\s+/, "")}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                        {group.openCount > 0 && <SidebarMenuBadge>{group.openCount}</SidebarMenuBadge>}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroup>
              )}

              {members && members.length > 0 && (
                <SidebarGroup>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        className="text-xs font-medium text-sidebar-foreground/50 cursor-pointer"
                        onClick={() => setStaffActivityExpanded(!staffActivityExpanded)}
                        tooltip="Staff Activity"
                      >
                        <MessageCircleReply className="size-4" />
                        <span className="group-data-[collapsible=icon]:hidden flex-1">Staff Activity</span>
                        {staffActivityExpanded ? (
                          <ChevronDown className="size-3 group-data-[collapsible=icon]:hidden" />
                        ) : (
                          <ChevronRight className="size-3 group-data-[collapsible=icon]:hidden" />
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {staffActivityExpanded &&
                      members.map((member) => (
                        <SidebarMenuItem key={member.id}>
                          <SidebarMenuButton
                            asChild
                            tooltip={`Conversations replied by ${member.displayName}`}
                            isActive={pathname === `/all` && currentRepliedBy === member.id}
                          >
                            <Link href={`/all?repliedBy=${member.id}&status=all`} onClick={handleItemClick}>
                              <User className="size-4" />
                              <span className="group-data-[collapsible=icon]:hidden truncate leading-tight">
                                {member.displayName.length > 20
                                  ? `${member.displayName.substring(0, 20)}...`
                                  : member.displayName}
                              </span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                  </SidebarMenu>
                </SidebarGroup>
              )}
            </div>
            <div className="mt-auto">
              <SidebarGroup>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === `/stats`} tooltip="Stats">
                      <Link href={`/stats`} onClick={handleItemClick}>
                        <BarChart className="size-4" />
                        <span className="group-data-[collapsible=icon]:hidden">Stats</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      tooltip="Settings"
                      onClick={() => {
                        previousAppUrlRef.current = pathname;
                      }}
                    >
                      <Link href={`/settings/${settingsItems[0].id}`} onClick={handleItemClick}>
                        <SettingsIcon className="size-4" />
                        <span className="group-data-[collapsible=icon]:hidden">Settings</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </div>
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <AccountDropdown />
      </SidebarFooter>
    </Sidebar>
  );
}
