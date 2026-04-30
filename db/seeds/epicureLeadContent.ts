/* eslint-disable no-console */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { faqs, issueGroups, mailboxes, savedReplies } from "@/db/schema";

const EPICURE_FAQS = [
  "What is the typical machine cost? Provide a range and what drives price (throughput, options, integration).",
  "What floor space / footprint is required for installation?",
  "What is the minimum order quantity (MOQ)?",
  "What are standard lead times from order to shipment?",
  "Which regions or countries do you serve and support?",
  "What training and documentation ship with the system?",
  "What warranty and service tiers are available?",
  "Can the system integrate with our existing line or MES?",
  "What utilities (power, air, network) are required?",
  "How do software updates and remote diagnostics work?",
];

/**
 * Idempotent Epicure defaults: six issue groups, six saved-reply templates, FAQ stubs.
 * Run with mailbox already created. Assignees stay empty—set Clark user IDs in Settings.
 */
export async function seedEpicureLeadContent() {
  const mailbox = await db.query.mailboxes.findFirst({ orderBy: (m, { asc: a }) => [a(m.id)] });
  if (!mailbox) {
    console.warn("seedEpicureLeadContent: no mailbox, skipping");
    return;
  }

  const existing = await db.query.issueGroups.findFirst({ where: eq(issueGroups.title, "Business Lead") });
  if (existing) {
    console.log("seedEpicureLeadContent: already seeded (Business Lead exists), skipping");
    return;
  }

  const groupSpecs: {
    title: string;
    description: string;
    color: string;
    templateName: string;
    templateBody: string;
  }[] = [
    {
      title: "Business Lead",
      description: "Inbound commercial interest, quotes, and general sales conversations.",
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
      description: "Suppliers, OEM pitches, component vendors.",
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

  const savedReplyIds: number[] = [];

  for (const spec of groupSpecs) {
    const [row] = await db
      .insert(savedReplies)
      .values({
        name: spec.templateName,
        content: spec.templateBody,
        templateType: "rich_text",
        unused_mailboxId: mailbox.id,
        isActive: true,
      })
      .returning({ id: savedReplies.id });
    if (row) savedReplyIds.push(row.id);
  }

  if (savedReplyIds.length !== groupSpecs.length) {
    throw new Error("seedEpicureLeadContent: failed to insert all saved replies");
  }

  for (let i = 0; i < groupSpecs.length; i++) {
    const spec = groupSpecs[i]!;
    await db.insert(issueGroups).values({
      title: spec.title,
      description: spec.description,
      color: spec.color,
      assignees: [],
      autoResponseEnabled: 0,
      defaultSavedReplyId: savedReplyIds[i]!,
    });
  }

  for (const content of EPICURE_FAQS) {
    await db.insert(faqs).values({
      content,
      unused_mailboxId: mailbox.id,
      enabled: true,
      suggested: false,
    });
  }

  await db
    .update(mailboxes)
    .set({
      weekendAutoReplyEnabled: false,
      holidayAutoReplyEnabled: false,
      preferences: {
        ...(mailbox.preferences ?? {}),
        autoRespondEmailToChat: "draft",
      },
    })
    .where(eq(mailboxes.id, mailbox.id));

  console.log("seedEpicureLeadContent: issue groups, saved replies, FAQs, and draft-only mailbox preferences applied");
}
