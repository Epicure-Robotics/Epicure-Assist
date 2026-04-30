/* eslint-disable no-console */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { faqs, issueGroups, mailboxes, savedReplies } from "@/db/schema";
import { EPICURE_ISSUE_GROUP_SPECS } from "@/lib/epicure/issueGroupSpecs";

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
 * Run with mailbox already created. Assignees stay empty—set Clerk user IDs in Settings.
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

  const savedReplyIds: number[] = [];

  for (const spec of EPICURE_ISSUE_GROUP_SPECS) {
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

  if (savedReplyIds.length !== EPICURE_ISSUE_GROUP_SPECS.length) {
    throw new Error("seedEpicureLeadContent: failed to insert all saved replies");
  }

  for (let i = 0; i < EPICURE_ISSUE_GROUP_SPECS.length; i++) {
    const spec = EPICURE_ISSUE_GROUP_SPECS[i]!;
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
