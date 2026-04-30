import Inbox from "@/app/(dashboard)/[category]/inbox";
import { api } from "@/trpc/server";

type PageProps = {
  params: Promise<{
    category: "all" | "assigned" | "unassigned" | "mine";
  }>;
  searchParams: Promise<{
    status?: "open" | "waiting_on_customer" | "closed" | "spam" | "check_back_later" | "ignored";
    sort?: "oldest" | "newest" | "highest_value";
    search?: string;
    assignee?: string | string[];
    createdAfter?: string;
    createdBefore?: string;
    repliedBy?: string | string[];
    customer?: string | string[];
    issueGroupId?: string;
    isClassified?: string;
    isAssigned?: string;
    hasUnreadMessages?: string;
  }>;
};

const Page = async ({ params, searchParams }: PageProps) => {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  // Build input for conversation list query
  const input = {
    status: resolvedSearchParams.status ? [resolvedSearchParams.status] : ["open"],
    sort: resolvedSearchParams.sort,
    category: resolvedParams.category,
    search: resolvedSearchParams.search ?? null,
    assignee: resolvedSearchParams.assignee
      ? Array.isArray(resolvedSearchParams.assignee)
        ? resolvedSearchParams.assignee
        : [resolvedSearchParams.assignee]
      : undefined,
    createdAfter: resolvedSearchParams.createdAfter ?? undefined,
    createdBefore: resolvedSearchParams.createdBefore ?? undefined,
    repliedBy: resolvedSearchParams.repliedBy
      ? Array.isArray(resolvedSearchParams.repliedBy)
        ? resolvedSearchParams.repliedBy
        : [resolvedSearchParams.repliedBy]
      : undefined,
    customer: resolvedSearchParams.customer
      ? Array.isArray(resolvedSearchParams.customer)
        ? resolvedSearchParams.customer
        : [resolvedSearchParams.customer]
      : undefined,
    issueGroupId: resolvedSearchParams.issueGroupId ? parseInt(resolvedSearchParams.issueGroupId) : undefined,
    isClassified: resolvedSearchParams.isClassified === "true" ? true : undefined,
    isAssigned: resolvedSearchParams.isAssigned === "true" ? true : undefined,
    hasUnreadMessages: resolvedSearchParams.hasUnreadMessages === "true" ? true : undefined,
    displayUnreadBehavior: ["mine", "assigned"].includes(resolvedParams.category),
  };

  // Prefetch all critical data in parallel on the server
  void Promise.all([
    // Prefetch conversation list (first page with 25 items)
    api.mailbox.conversations.list.prefetchInfinite(input),
    // Prefetch open counts for all tabs
    api.mailbox.openCount.prefetch(),
    // Prefetch issue groups for filters
    api.mailbox.issueGroups.listAll.prefetch(),
    // Prefetch team members for assignee dropdown
    api.mailbox.members.list.prefetch(),
  ]);

  return <Inbox />;
};

export default Page;
