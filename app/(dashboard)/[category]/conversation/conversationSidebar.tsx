import {
  ChevronDown,
  ChevronRight,
  CornerUpLeft,
  ExternalLink,
  Mail,
  ShoppingBag,
  Trash2,
  User,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import CopyToClipboard from "react-copy-to-clipboard";
import { toast } from "sonner";
import { AssignPopoverButton } from "@/app/(dashboard)/[category]/conversation/assignPopoverButton";
import { useConversationContext } from "@/app/(dashboard)/[category]/conversation/conversationContext";
import { IssueAssignButton } from "@/app/(dashboard)/[category]/conversation/issueAssignButton";
import { ShopifyOrderItem } from "@/app/(dashboard)/[category]/conversation/shopifyOrderItem";
import { useAssignTicket } from "@/app/(dashboard)/[category]/conversation/useAssignTicket";
import { useConversationListContext } from "@/app/(dashboard)/[category]/list/conversationListContext";
import { Conversation } from "@/app/types/global";
import HumanizedTime from "@/components/humanizedTime";
import { JsonView } from "@/components/jsonView";
import LoadingSpinner from "@/components/loadingSpinner";
import { SimilarityCircle } from "@/components/similarityCircle";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/components/useSession";
import { getFullName } from "@/lib/auth/authUtils";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

interface ConversationSidebarProps {
  conversation: Conversation;
}

interface ConversationItemProps {
  slug: string;
  subject: string;
  summary?: string | string[] | null;
  createdAt: Date;
  similarity?: number;
  status: "open" | "waiting_on_customer" | "closed" | "spam" | "check_back_later" | "ignored" | null;
  navigateToConversation: (slug: string) => void;
  updateStatus: (status: "closed" | "waiting_on_customer" | "spam" | "open" | "check_back_later" | "ignored") => void;
}

const ConversationItem = ({
  slug,
  subject,
  summary,
  createdAt,
  similarity,
  status,
  navigateToConversation,
  updateStatus,
}: ConversationItemProps) => (
  <div
    key={slug}
    className="text-muted-foreground transition-colors hover:text-foreground cursor-pointer group"
    onClick={() => navigateToConversation(slug)}
  >
    <div className="flex items-center gap-2 mb-1">
      <a
        href={`/conversations?id=${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "mr-auto text-sm truncate",
          (status === "open" || status === "waiting_on_customer" || status === "check_back_later") && "font-bold",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {subject || "(no subject)"}
      </a>
      {status && status !== "closed" && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            updateStatus("closed");
          }}
        >
          <CornerUpLeft className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </Button>
      )}
      <div className="flex items-center text-xs text-muted-foreground gap-2">
        <HumanizedTime time={createdAt} />
        {similarity !== undefined && <SimilarityCircle similarity={similarity} />}
      </div>
    </div>
    {summary && <div className="text-muted-foreground text-xs line-clamp-2 mb-2">{summary}</div>}
  </div>
);

const ConversationSidebar = ({ conversation }: ConversationSidebarProps) => {
  const formatStatus = (status: ConversationItemProps["status"]) => {
    if (status === "waiting_on_customer") return "waiting on customer";
    if (status === "check_back_later") return "check back later";
    if (status === "ignored") return "ignored";
    return status || "open";
  };
  const { navigateToConversation } = useConversationListContext();
  const { updateStatus } = useConversationContext();
  const { assignTicket, toggleAI } = useAssignTicket();
  const { user: currentUser } = useSession() ?? {};
  const [previousExpanded, setPreviousExpanded] = useState(true);
  const [similarExpanded, setSimilarExpanded] = useState(false);
  const [shopifyExpanded, setShopifyExpanded] = useState(false);
  const [pocketExpanded, setPocketExpanded] = useState(false);
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [shopifyManualInput, setShopifyManualInput] = useState("");
  const [shopifyActiveInput, setShopifyActiveInput] = useState("");
  const [pocketManualEmail, setPocketManualEmail] = useState("");
  const [pocketActiveEmail, setPocketActiveEmail] = useState("");

  // Auto-detect if input is email or order number
  const detectShopifySearchType = (input: string): "email" | "order" => {
    if (!input) return "email";
    // If contains @, it's an email
    if (input.includes("@")) return "email";
    // If starts with # or is all digits, it's an order number
    if (input.startsWith("#") || /^\d+$/.test(input)) return "order";
    // Default to order for other cases (like order names)
    return "order";
  };

  const shopifySearchType = detectShopifySearchType(shopifyActiveInput);

  const { data: customerConversations, isFetching: isFetchingPrevious } = api.mailbox.conversations.list.useQuery(
    { customer: [conversation.emailFrom ?? ""], sort: "oldest" },
    {
      enabled: !!conversation.emailFrom && previousExpanded,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  );

  const { data: similarConversations, isFetching: isFetchingSimilar } = api.mailbox.conversations.findSimilar.useQuery(
    { conversationSlug: conversation.slug },
    {
      enabled: similarExpanded,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  );

  const shopifyQueryInput = shopifyActiveInput || conversation.emailFrom || "";
  const shopifyQueryType = detectShopifySearchType(shopifyQueryInput);

  const { data: shopifyDataByEmail, isFetching: isFetchingShopifyByEmail } =
    api.mailbox.conversations.shopify.getCustomerOrders.useQuery(
      { email: shopifyQueryInput },
      {
        enabled: !!shopifyQueryInput && shopifyExpanded && shopifyQueryType === "email",
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
      },
    );

  const { data: shopifyDataByOrder, isFetching: isFetchingShopifyByOrder } =
    api.mailbox.conversations.shopify.getOrderByName.useQuery(
      { orderName: shopifyQueryInput },
      {
        enabled: !!shopifyQueryInput && shopifyExpanded && shopifyQueryType === "order",
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
      },
    );

  const shopifyData = shopifyQueryType === "email" ? shopifyDataByEmail : shopifyDataByOrder;
  const isFetchingShopify = shopifyQueryType === "email" ? isFetchingShopifyByEmail : isFetchingShopifyByOrder;

  const pocketQueryEmail = pocketActiveEmail || conversation.emailFrom || "";
  const { data: pocketData, isFetching: isFetchingPocket } = api.mailbox.conversations.pocket.getUserInfo.useQuery(
    { email: pocketQueryEmail },
    {
      enabled: !!pocketQueryEmail && pocketExpanded,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  );

  const utils = api.useUtils();
  const updateSubscriptionMutation = api.mailbox.conversations.pocket.updateUserSubscription.useMutation({
    onSuccess: () => {
      toast.success("Subscription updated successfully");
      void utils.mailbox.conversations.pocket.getUserInfo.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update subscription");
    },
  });
  const deleteDeviceMutation = api.mailbox.conversations.pocket.deleteUserDevice.useMutation({
    onSuccess: () => {
      toast.success("Device deleted successfully");
      void utils.mailbox.conversations.pocket.getUserInfo.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete device");
    },
  });
  const syncSubscriptionMutation = api.mailbox.conversations.pocket.syncUserSubscription.useMutation({
    onSuccess: () => {
      toast.success("Subscription synced successfully");
      void utils.mailbox.conversations.pocket.getUserInfo.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to sync subscription");
    },
  });

  // Check if customer exists in platform customers
  const { data: customerExistsData } = api.mailbox.customers.exists.useQuery(
    { email: conversation.emailFrom ?? "" },
    {
      enabled: !!conversation.emailFrom,
    },
  );

  const createCustomerMutation = api.mailbox.customers.create.useMutation({
    onSuccess: () => {
      toast.success("Customer added successfully");
      void utils.mailbox.customers.exists.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add customer");
    },
  });

  const previousConversations = customerConversations?.conversations.filter(({ slug }) => slug !== conversation.slug);

  return (
    <div className="flex flex-col h-dvh bg-background">
      <div className="flex flex-col gap-3 text-sm p-4 border-b border-border">
        <h3>Conversation</h3>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <span className="text-muted-foreground">Status</span>
          <div>
            <Select
              value={conversation.status || "open"}
              onValueChange={(value) =>
                updateStatus(
                  value as "open" | "waiting_on_customer" | "closed" | "spam" | "check_back_later" | "ignored",
                )
              }
            >
              <SelectTrigger className="h-7 w-auto min-w-[140px] text-xs">
                <SelectValue>
                  <Badge variant="default" className="text-xs">
                    {formatStatus(conversation.status)}
                  </Badge>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="waiting_on_customer">Waiting on user</SelectItem>
                <SelectItem value="check_back_later">Check back later</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="spam">Spam</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span className="text-muted-foreground">Assignee</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <AssignPopoverButton initialAssignedToId={conversation.assignedToId} />
              {!conversation.assignedToId && <span className="text-muted-foreground">-</span>}
              {currentUser && (
                <button
                  className="text-primary hover:underline text-sm"
                  onClick={() => {
                    const selfAssignee = {
                      id: currentUser.id,
                      displayName: getFullName(currentUser),
                    };
                    assignTicket(selfAssignee, null);
                  }}
                >
                  Assign yourself
                </button>
              )}
            </div>
          </div>
          <span className="text-muted-foreground">AI Auto-Response</span>
          <div className="flex items-center gap-2">
            <Switch
              checked={conversation.assignedToAI}
              onCheckedChange={(checked) => toggleAI(checked)}
              id="ai-auto-response"
              className="scale-75 origin-left"
            />
            <label htmlFor="ai-auto-response" className="text-xs text-muted-foreground cursor-pointer">
              {conversation.assignedToAI ? "Enabled" : "Disabled"}
            </label>
          </div>
          <span className="text-muted-foreground">Issue</span>
          <div className="min-w-0">
            <IssueAssignButton initialIssueGroupId={conversation.issueGroupId} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-4 border-b border-border text-sm">
          <div className="flex items-center justify-between">
            <h3>Customer</h3>
            {conversation.emailFrom && !customerExistsData?.exists && (
              <Button
                variant="outlined"
                size="sm"
                onClick={() => {
                  if (conversation.emailFrom) {
                    createCustomerMutation.mutate({ email: conversation.emailFrom });
                  }
                }}
                disabled={createCustomerMutation.isPending}
                className="h-7"
              >
                <UserPlus className="h-3 w-3 mr-1" />
                Add to Customers
              </Button>
            )}
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <Avatar fallback={conversation.emailFrom ?? "?"} size="md" />
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  "truncate",
                  conversation.customerInfo?.name || conversation.emailFrom
                    ? "text-base font-medium"
                    : "text-muted-foreground",
                )}
                title={conversation.customerInfo?.name || conversation.emailFrom || ""}
              >
                {conversation.customerInfo?.name || conversation.emailFrom || "Anonymous"}
              </span>
              {conversation.customerInfo?.isVip && <Badge variant="bright">VIP</Badge>}
              {conversation.customerInfo?.value && conversation.customerInfo.value > 0 && (
                <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  {conversation.customerInfo.value / 100}
                </div>
              )}
            </div>
            {conversation.emailFrom && (
              <CopyToClipboard
                text={conversation.emailFrom ?? ""}
                onCopy={(_, success) =>
                  success ? toast.success("Copied!") : toast.error("Failed to copy to clipboard")
                }
              >
                <div className="col-start-2 text-primary flex cursor-pointer items-center gap-2 min-w-0">
                  <Mail className="h-4 w-4 flex-shrink-0" />
                  <a
                    className="overflow-hidden text-ellipsis whitespace-nowrap hover:underline min-w-0 flex-1"
                    title={conversation.emailFrom ?? ""}
                  >
                    {conversation.emailFrom}
                  </a>
                </div>
              </CopyToClipboard>
            )}

            {Object.entries(conversation.customerInfo?.links ?? {}).map(([label, url], idx) => (
              <a
                key={idx}
                className="col-start-2 mt-1 flex items-center gap-2 hover:underline"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                {label}
              </a>
            ))}

            {conversation.customerInfo?.metadata && Object.keys(conversation.customerInfo.metadata).length > 0 && (
              <>
                <div className="col-start-2 mt-2">
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setMetadataExpanded(!metadataExpanded)}
                  >
                    {metadataExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <span>Details</span>
                  </button>
                </div>
                {metadataExpanded && (
                  <div className="col-start-2 mt-2 text-xs text-muted-foreground border rounded p-2 overflow-x-auto">
                    <div className="font-mono">
                      <JsonView data={conversation.customerInfo.metadata} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <Accordion type="multiple" defaultValue={["previous"]}>
          <AccordionItem value="shopify">
            <AccordionTrigger className="px-4" onClick={() => setShopifyExpanded(!shopifyExpanded)}>
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                Shopify Orders
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <div className="space-y-3">
                {isFetchingShopify ? (
                  <div className="flex items-center justify-center py-4">
                    <LoadingSpinner size="sm" />
                  </div>
                ) : shopifyData?.configured === false ? (
                  <div className="text-sm text-muted-foreground">Shopify integration not configured</div>
                ) : shopifyData?.error ? (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs">{shopifyData.error}</AlertDescription>
                  </Alert>
                ) : !shopifyData?.customer ? (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      {shopifyActiveInput
                        ? shopifySearchType === "email"
                          ? `No customer found for ${shopifyActiveInput}`
                          : `No order found: ${shopifyActiveInput}`
                        : "Customer not found in Shopify"}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="Search by email or order #..."
                        value={shopifyManualInput}
                        onChange={(e) => setShopifyManualInput(e.target.value)}
                        className="h-8 text-xs flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (shopifyManualInput) {
                            setShopifyActiveInput(shopifyManualInput);
                          }
                        }}
                        disabled={!shopifyManualInput}
                      >
                        Search
                      </Button>
                    </div>
                  </div>
                ) : shopifyData.orders.length === 0 ? (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">No Shopify orders found</div>
                    {!shopifyActiveInput && (
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          placeholder="Search by email or order #..."
                          value={shopifyManualInput}
                          onChange={(e) => setShopifyManualInput(e.target.value)}
                          className="h-8 text-xs flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            if (shopifyManualInput) {
                              setShopifyActiveInput(shopifyManualInput);
                            }
                          }}
                          disabled={!shopifyManualInput}
                        >
                          Search
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {shopifyActiveInput && (
                      <div className="flex items-center gap-2 mb-2 text-xs">
                        <span className="text-muted-foreground">
                          Showing {shopifySearchType === "order" ? "order" : "results for"}: {shopifyActiveInput}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShopifyActiveInput("");
                            setShopifyManualInput("");
                          }}
                          className="h-6 text-xs"
                        >
                          Clear
                        </Button>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mb-2">
                      {shopifyData.customer.first_name && shopifyData.customer.last_name
                        ? `${shopifyData.customer.first_name} ${shopifyData.customer.last_name} • `
                        : ""}
                      {shopifyData.orders.length} {shopifyData.orders.length === 1 ? "order" : "orders"}
                      {shopifyData.customer.total_spent &&
                        parseFloat(shopifyData.customer.total_spent) > 0 &&
                        ` • Total: $${parseFloat(shopifyData.customer.total_spent).toFixed(2)}`}
                    </div>
                    {shopifyData.orders.map((order) => (
                      <ShopifyOrderItem key={order.id} order={order} />
                    ))}
                  </>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="pocket">
            <AccordionTrigger className="px-4" onClick={() => setPocketExpanded(!pocketExpanded)}>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Pocket User Info
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <div className="space-y-3">
                {isFetchingPocket ? (
                  <div className="flex items-center justify-center py-4">
                    <LoadingSpinner size="sm" />
                  </div>
                ) : !pocketData?.configured ? (
                  <div className="text-sm text-muted-foreground">Pocket integration not configured</div>
                ) : pocketData?.error ? (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs">{pocketData.error}</AlertDescription>
                  </Alert>
                ) : !pocketData?.found || !pocketData?.user ? (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      {pocketActiveEmail ? `No user found for ${pocketActiveEmail}` : "User not found in Pocket"}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="Search by email..."
                        value={pocketManualEmail}
                        onChange={(e) => setPocketManualEmail(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (pocketManualEmail) {
                            setPocketActiveEmail(pocketManualEmail);
                          }
                        }}
                        disabled={!pocketManualEmail}
                      >
                        Search
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    {pocketActiveEmail && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-muted-foreground">Showing results for: {pocketActiveEmail}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPocketActiveEmail("");
                            setPocketManualEmail("");
                          }}
                          className="h-6 text-xs"
                        >
                          Clear
                        </Button>
                      </div>
                    )}

                    {/* User ID */}
                    {pocketData.user?.id && (
                      <div>
                        <span className="font-medium">User ID:</span>{" "}
                        <span className="text-muted-foreground font-mono text-xxs">{pocketData.user.id}</span>
                      </div>
                    )}

                    {/* RevenueCat Link */}
                    {pocketData.user?.id && (
                      <a
                        className="flex items-center gap-2 text-primary hover:underline"
                        href={`https://app.revenuecat.com/projects/d770554c/customers/${pocketData.user.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open in RevenueCat
                      </a>
                    )}

                    {/* Profile */}
                    {pocketData.user?.display_name && (
                      <div>
                        <span className="font-medium">Name:</span>{" "}
                        <span className="text-muted-foreground">{pocketData.user.display_name}</span>
                      </div>
                    )}

                    {/* Subscription */}
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Subscription:</span>
                      {pocketData.user?.deleted_at ? (
                        pocketData.user.subscription_type ? (
                          <Badge variant="bright">{pocketData.user.subscription_type}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )
                      ) : pocketData.user ? (
                        <Select
                          value={pocketData.user.subscription_type || ""}
                          onValueChange={(value) => {
                            if (pocketData.user) {
                              updateSubscriptionMutation.mutate({
                                userId: pocketData.user.id,
                                subscriptionType: value as "new_member" | "founding_member" | "black_friday_member",
                              });
                            }
                          }}
                          disabled={updateSubscriptionMutation.isPending}
                        >
                          <SelectTrigger className="h-7 text-xs w-auto min-w-[160px]">
                            <SelectValue placeholder="Select subscription" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new_member">new_member</SelectItem>
                            <SelectItem value="founding_member">founding_member</SelectItem>
                            <SelectItem value="black_friday_member">black_friday_member</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>

                    {/* Sync Subscription Button */}
                    {pocketData.user && !pocketData.user.deleted_at && (
                      <div>
                        <Button
                          variant="outlined"
                          size="sm"
                          onClick={() => {
                            if (pocketData.user) {
                              syncSubscriptionMutation.mutate({
                                userId: pocketData.user.id,
                              });
                            }
                          }}
                          disabled={syncSubscriptionMutation.isPending}
                          className="h-7 text-xs"
                        >
                          {syncSubscriptionMutation.isPending ? "Syncing..." : "Sync Subscription"}
                        </Button>
                      </div>
                    )}

                    {/* Onboarding Status */}
                    {pocketData.user?.onboarding_status && (
                      <div>
                        <span className="font-medium">Onboarding:</span>{" "}
                        <span className="text-muted-foreground">{pocketData.user.onboarding_status}</span>
                      </div>
                    )}

                    {/* Role */}
                    {pocketData.user?.role && (
                      <div>
                        <span className="font-medium">Role:</span>{" "}
                        <span className="text-muted-foreground">{pocketData.user.role}</span>
                      </div>
                    )}

                    {/* App Version */}
                    {pocketData.user?.app_version && (
                      <div>
                        <span className="font-medium">App Version:</span>{" "}
                        <span className="text-muted-foreground">{pocketData.user.app_version}</span>
                      </div>
                    )}

                    {/* Devices */}
                    <div className="space-y-2">
                      <div>
                        <span className="font-medium">All Devices:</span>{" "}
                        <span className="text-muted-foreground">
                          {pocketData.user.devices.length} {pocketData.user.devices.length === 1 ? "device" : "devices"}
                        </span>
                      </div>
                      {pocketData.user.devices.length === 0 ? (
                        <div className="text-muted-foreground">No devices found</div>
                      ) : (
                        <div className="space-y-2">
                          {pocketData.user.devices.map((device) => (
                            <div key={device.id} className="border rounded p-2 space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-medium truncate">
                                    {device.model_string || device.device_id || "Unknown device"}
                                  </div>
                                  <div className="text-muted-foreground font-mono text-xxs break-all">{device.id}</div>
                                </div>
                                <Button
                                  variant="destructive_outlined"
                                  size="sm"
                                  onClick={() => {
                                    if (!pocketData.user) return;
                                    const shouldDelete = window.confirm(
                                      `Delete device ${device.model_string || device.device_id || device.id}?`,
                                    );
                                    if (!shouldDelete) return;
                                    deleteDeviceMutation.mutate({
                                      userId: pocketData.user.id,
                                      deviceId: device.id,
                                      conversationId: conversation.id,
                                      modelString: device.model_string || undefined,
                                      serialNumber: device.serial_number || undefined,
                                    });
                                  }}
                                  disabled={deleteDeviceMutation.isPending}
                                  className="h-6 px-2"
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Delete
                                </Button>
                              </div>
                              {device.device_id && (
                                <div>
                                  <span className="font-medium">Device ID:</span>{" "}
                                  <span className="text-muted-foreground font-mono text-xxs">{device.device_id}</span>
                                </div>
                              )}
                              {device.serial_number && (
                                <div>
                                  <span className="font-medium">Serial:</span>{" "}
                                  <span className="text-muted-foreground font-mono text-xxs">
                                    {device.serial_number}
                                  </span>
                                </div>
                              )}
                              {device.firmware_version && (
                                <div>
                                  <span className="font-medium">Firmware:</span>{" "}
                                  <span className="text-muted-foreground">{device.firmware_version}</span>
                                  {device.wifi_firmware_version && (
                                    <span className="text-muted-foreground">
                                      {" "}
                                      (WiFi: {device.wifi_firmware_version})
                                    </span>
                                  )}
                                </div>
                              )}
                              {device.last_sync_time && (
                                <div>
                                  <span className="font-medium">Last Sync:</span>{" "}
                                  <HumanizedTime time={new Date(device.last_sync_time)} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Deletion Info */}
                    {pocketData.user?.deleted_at && (
                      <div className="border-t pt-2 mt-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-destructive font-medium">Account Deleted</span>
                          <Badge variant="destructive">Deleted</Badge>
                        </div>
                        <div>
                          <span className="font-medium">Deleted At:</span>{" "}
                          <HumanizedTime time={new Date(pocketData.user.deleted_at)} />
                        </div>
                        {pocketData.user.deletion_reason && (
                          <div className="mt-1">
                            <span className="font-medium">Reason:</span>{" "}
                            <span className="text-muted-foreground">{pocketData.user.deletion_reason}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="previous">
            <AccordionTrigger className="px-4" onClick={() => setPreviousExpanded(!previousExpanded)}>
              Previous conversations
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <div className="space-y-3">
                {isFetchingPrevious ? (
                  <div className="flex items-center justify-center">
                    <LoadingSpinner size="sm" />
                  </div>
                ) : previousConversations?.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No previous conversations</div>
                ) : (
                  previousConversations?.map((conv) => (
                    <ConversationItem
                      key={conv.slug}
                      slug={conv.slug}
                      subject={conv.subject}
                      summary={conv.summary}
                      createdAt={conv.createdAt}
                      status={conv.status}
                      navigateToConversation={navigateToConversation}
                      updateStatus={updateStatus}
                    />
                  ))
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="similar">
            <AccordionTrigger className="px-4" onClick={() => setSimilarExpanded(!similarExpanded)}>
              Similar conversations
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <div className="space-y-3">
                {isFetchingSimilar ? (
                  <div className="flex items-center justify-center">
                    <LoadingSpinner size="sm" />
                  </div>
                ) : similarConversations?.conversations.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No similar conversations</div>
                ) : (
                  similarConversations?.conversations.map((conv) => (
                    <ConversationItem
                      key={conv.slug}
                      slug={conv.slug}
                      subject={conv.subject}
                      summary={conv.summary}
                      createdAt={conv.createdAt}
                      status={conv.status}
                      similarity={similarConversations?.similarityMap?.[conv.slug]}
                      navigateToConversation={navigateToConversation}
                      updateStatus={updateStatus}
                    />
                  ))
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};

export default ConversationSidebar;
