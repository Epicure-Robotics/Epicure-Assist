/**
 * Canonical Epicure inbox issue groups + default saved-reply bodies.
 * Used by db seed and by scripts/sync-epicure-issue-groups.ts to refresh copy without re-seeding.
 */
export type EpicureIssueGroupSpec = {
  title: string;
  description: string;
  color: string;
  templateName: string;
  templateBody: string;
};

export const EPICURE_ISSUE_GROUP_SPECS: EpicureIssueGroupSpec[] = [
  {
    title: "Business Lead",
    description:
      "Inbound commercial interest, quotes, pilots, and general sales conversations (end customers evaluating Epicure equipment).",
    color: "#2563eb",
    templateName: "Epicure reply — Business lead",
    templateBody: `Hi {{name}},

Thank you for reaching out about {{specific_use_case}}. We're glad to learn more about what you're building.

Regarding scale and scope ({{deal_size_hint}}), our team can recommend the right next step. Could you share your timeline and location?

Best regards,
Epicure Robotics`,
  },
  {
    title: "Vendor / Manufacturer Pitch",
    description:
      "Suppliers or manufacturers pitching components, contract manufacturing, or lower-cost alternatives (‘use our parts/services’) — not a buyer evaluating Epicure equipment.",
    color: "#7c3aed",
    templateName: "Epicure reply — Vendor pitch",
    templateBody: `Hi {{name}},

Thanks for your note on {{specific_use_case}}. We review vendor and manufacturing partnerships carefully.

Please share capability summary, certifications, and any {{deal_size_hint}} context.

Best,
Epicure Robotics`,
  },
  {
    title: "Partnership / Distributor",
    description: "Distribution, reseller, or strategic partnership inquiries.",
    color: "#059669",
    templateName: "Epicure reply — Partnership",
    templateBody: `Hi {{name}},

We appreciate your interest in partnership around {{specific_use_case}}.

To route this internally, could you outline regions covered, existing customer base, and {{deal_size_hint}}?

Best,
Epicure Robotics`,
  },
  {
    title: "Hiring",
    description: "Careers, recruiting, and talent outreach.",
    color: "#d97706",
    templateName: "Epicure reply — Hiring",
    templateBody: `Hi {{name}},

Thanks for connecting regarding {{specific_use_case}}. For hiring and people-related topics we’ll get you to the right contact.

Please share role or opportunity details and {{deal_size_hint}} if relevant.

Best,
Epicure Robotics`,
  },
  {
    title: "Press / Media",
    description: "Journalists, podcasts, events, and PR.",
    color: "#db2777",
    templateName: "Epicure reply — Press",
    templateBody: `Hi {{name}},

Thank you for reaching out about {{specific_use_case}}. We’ll review press and media requests as schedules allow.

If there’s a deadline or outlet detail ({{deal_size_hint}}), please note it here.

Best,
Epicure Robotics`,
  },
  {
    title: "Other",
    description: "Catch-all for messages that do not fit other groups.",
    color: "#64748b",
    templateName: "Epicure reply — General",
    templateBody: `Hi {{name}},

Thanks for your message about {{specific_use_case}}. We’ve logged your note and will follow up.

If helpful, any extra context ({{deal_size_hint}}) speeds routing.

Best,
Epicure Robotics`,
  },
];
