import type {
  HelperCurrentUserResult,
  HelperListTicketsResult,
  HelperNoteResult,
  HelperPocketUserLookupResult,
  HelperReplyResult,
  HelperResponseFormat,
  HelperShopifyLookupResult,
  HelperTeamMember,
  HelperTeamMembersResult,
  HelperTicketDetail,
  HelperTicketMutationResult,
  HelperTimelineEntry,
} from "./service.js";

const truncate = (value: string | null | undefined, limit = 220) => {
  if (!value) return null;
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit - 3)}...`;
};

const formatActor = (displayName: string, email: string | null) => (email ? `${displayName} <${email}>` : displayName);

const formatAssignee = (member: HelperTeamMember | null) =>
  member ? formatActor(member.display_name, member.email) : "unassigned";

const formatCustomer = (ticket: {
  customer: { email: string | null; name: string | null; is_vip: boolean | null };
}) => {
  const label = ticket.customer.name
    ? `${ticket.customer.name}${ticket.customer.email ? ` <${ticket.customer.email}>` : ""}`
    : (ticket.customer.email ?? "unknown customer");
  return ticket.customer.is_vip ? `${label} [VIP]` : label;
};

const formatShopifyCustomer = (customer: { first_name: string | null; last_name: string | null; email: string }) => {
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
  return name ? `${name} <${customer.email}>` : customer.email;
};

const formatTimelineEntry = (entry: HelperTimelineEntry, index: number) => {
  const prefix = `${index + 1}. [${entry.created_at}] ${entry.type}`;

  if (entry.type === "event") {
    const eventLabel = entry.event_type ?? "update";
    const changeText = entry.changes ? ` | changes: ${JSON.stringify(entry.changes)}` : "";
    return `${prefix} ${eventLabel}${changeText}`;
  }

  if (entry.type === "guide_session") {
    return `${prefix} guide status=${entry.guide_status ?? "unknown"} | ${truncate(entry.body_text ?? entry.title ?? entry.instructions, 180) ?? "no details"}`;
  }

  const actor = entry.author ? formatActor(entry.author.display_name, entry.author.email) : (entry.from ?? "system");
  return `${prefix} ${actor} | ${truncate(entry.body_text ?? entry.body ?? entry.html_body, 180) ?? "no body"}`;
};

const formatTicketHeader = (ticket: HelperTicketDetail) =>
  [
    `Ticket ${ticket.slug}`,
    `status: ${ticket.status}`,
    `subject: ${ticket.subject}`,
    `customer: ${formatCustomer(ticket)}`,
    `assignee: ${formatAssignee(ticket.assigned_to)}`,
    `ai_auto_response: ${ticket.assigned_to_ai ? "enabled" : "disabled"}`,
    `provider: ${ticket.conversation_provider ?? "unknown"}`,
    `created_at: ${ticket.created_at}`,
    `updated_at: ${ticket.updated_at}`,
    ticket.closed_at ? `closed_at: ${ticket.closed_at}` : null,
    ticket.cc_recipients.length ? `cc: ${ticket.cc_recipients.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

export const renderStructuredText = <T>(
  format: HelperResponseFormat,
  structured: T,
  markdownRenderer: (structured: T) => string,
) => {
  if (format === "json") {
    return JSON.stringify(structured, null, 2);
  }
  return markdownRenderer(structured);
};

export const formatCurrentUser = (result: HelperCurrentUserResult) =>
  [
    `Acting as ${formatActor(result.acting_as.display_name, result.acting_as.email)}`,
    `permissions: ${result.acting_as.permissions}`,
    `mailbox: ${result.mailbox.name} (${result.mailbox.slug})`,
  ].join("\n");

export const formatTeamMembers = (result: HelperTeamMembersResult) => {
  if (result.members.length === 0) {
    return `Acting as ${formatActor(result.acting_as.display_name, result.acting_as.email)}\n\nNo team members found.`;
  }

  return [
    `Acting as ${formatActor(result.acting_as.display_name, result.acting_as.email)}`,
    `Returned ${result.members.length} team member(s).`,
    result.members
      .map(
        (member, index) =>
          `${index + 1}. ${formatActor(member.display_name, member.email)} | role=${member.role} | permissions=${member.permissions} | open_tickets=${member.open_ticket_count}`,
      )
      .join("\n"),
  ].join("\n\n");
};

export const formatListTickets = (result: HelperListTicketsResult) => {
  const modeLine = result.resolved_view
    ? `Returned ${result.total_returned} ticket(s). view=${result.resolved_view} | sort=${result.resolved_sort}`
    : `Returned ${result.total_returned} ticket(s). sort=${result.resolved_sort}`;

  if (result.tickets.length === 0) {
    return [
      `Acting as ${formatActor(result.acting_as.display_name, result.acting_as.email)}`,
      modeLine,
      "No tickets matched the current filters.",
      `filters: ${JSON.stringify(result.applied_filters)}`,
    ].join("\n\n");
  }

  return [
    `Acting as ${formatActor(result.acting_as.display_name, result.acting_as.email)}`,
    modeLine,
    result.tickets
      .map(
        (ticket, index) =>
          `${index + 1}. ${ticket.slug} | ${ticket.status} | ${ticket.subject}\ncustomer: ${formatCustomer(ticket)}\nassignee: ${formatAssignee(ticket.assigned_to)}\nupdated_at: ${ticket.updated_at}\nrecent: ${truncate(ticket.recent_message_text ?? ticket.matched_message_text, 180) ?? "none"}`,
      )
      .join("\n\n"),
    result.next_cursor ? `next_cursor: ${result.next_cursor}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
};

export const formatTicket = (ticket: HelperTicketDetail) => {
  const sections = [formatTicketHeader(ticket)];

  if (ticket.ai_draft?.body) {
    sections.push(`draft: ${truncate(ticket.ai_draft.body, 240)}`);
  }

  if (ticket.timeline.length > 0) {
    sections.push(
      `timeline${ticket.timeline_truncated ? ` (showing ${ticket.timeline.length} of ${ticket.total_timeline_entries})` : ""}:\n${ticket.timeline
        .map(formatTimelineEntry)
        .join("\n")}`,
    );
  }

  return sections.join("\n\n");
};

export const formatTicketMutation = (
  label: string,
  result: HelperTicketMutationResult | HelperReplyResult | HelperNoteResult,
) => {
  const metadata: string[] = [`Acting as ${formatActor(result.acting_as.display_name, result.acting_as.email)}`, label];

  if ("message_id" in result) {
    metadata.push(`message_id: ${result.message_id}`);
  }

  if ("note_id" in result) {
    metadata.push(`note_id: ${result.note_id}`);
  }

  return `${metadata.join("\n")}\n\n${formatTicket(result.ticket)}`;
};

export const formatShopifyLookup = (result: HelperShopifyLookupResult) => {
  const header = [
    `Acting as ${formatActor(result.acting_as.display_name, result.acting_as.email)}`,
    `Shopify lookup: ${result.lookup.mode}=${result.lookup.value}`,
  ];

  if (!result.configured) {
    return [...header, "Shopify integration is not configured."].join("\n\n");
  }

  if (result.error) {
    return [...header, `error: ${result.error}`].join("\n\n");
  }

  if (!result.found) {
    return [...header, "No Shopify customer or orders matched that lookup."].join("\n\n");
  }

  const customerSection = result.customer
    ? `customer: ${formatShopifyCustomer(result.customer)} | orders_count=${result.customer.orders_count} | total_spent=${result.customer.total_spent}`
    : "customer: none";

  const ordersSection = result.orders.length
    ? result.orders
        .map(
          (order, index) =>
            `${index + 1}. ${order.name} | ${order.financial_status} | ${order.fulfillment_status ?? "unfulfilled"} | ${order.total_price} ${order.currency}\nemail: ${order.email}\nline_items: ${order.line_items.length} | fulfillments: ${order.fulfillments.length}\nadmin_url: ${order.admin_url}`,
        )
        .join("\n\n")
    : "No orders found for this Shopify customer.";

  return [...header, customerSection, `Returned ${result.total_orders} order(s).`, ordersSection].join("\n\n");
};

export const formatPocketUserLookup = (result: HelperPocketUserLookupResult) => {
  const header = [
    `Acting as ${formatActor(result.acting_as.display_name, result.acting_as.email)}`,
    `Pocket lookup: email=${result.lookup_email}`,
  ];

  if (!result.configured) {
    return [...header, "Pocket integration is not configured."].join("\n\n");
  }

  if (result.error) {
    return [...header, `error: ${result.error}`].join("\n\n");
  }

  if (!result.found || !result.user) {
    return [...header, "No Pocket user matched that email."].join("\n\n");
  }

  const user = result.user;
  const userHeader = [
    `user: ${user.display_name ? `${user.display_name} <${user.email}>` : user.email}`,
    `subscription_type: ${user.subscription_type ?? "unknown"}`,
    `onboarding_status: ${user.onboarding_status ?? "unknown"}`,
    `role: ${user.role ?? "unknown"}`,
    `app_version: ${user.app_version ?? "unknown"}`,
    user.deleted_at ? `deleted_at: ${user.deleted_at}` : null,
    user.deletion_reason ? `deletion_reason: ${user.deletion_reason}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const devicesSection = user.devices.length
    ? user.devices
        .map(
          (device, index) =>
            `${index + 1}. device_id=${device.device_id ?? "unknown"} | serial=${device.serial_number ?? "unknown"} | model=${device.model_string ?? "unknown"} | firmware=${device.firmware_version ?? "unknown"} | last_sync=${device.last_sync_time ?? "unknown"}`,
        )
        .join("\n")
    : "No devices found.";

  return [...header, userHeader, `Returned ${user.devices.length} device(s).`, devicesSection].join("\n\n");
};
