#!/usr/bin/env tsx
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { faqs, mailboxes, websitePages, websites } from "@/db/schema";
import { getMailbox } from "@/lib/data/mailbox";

const DEFAULT_OUTPUT_DIR = ".cache/knowledge-export";

type Args = {
  mailboxId?: number;
  mailboxSlug?: string;
  outDir: string;
};

type ExportManifest = {
  exportedAt: string;
  mailbox: {
    id: number;
    name: string;
    slug: string;
  };
  includedRowMailboxIds: number[];
  counts: {
    faqs: number;
    enabledFaqs: number;
    suggestedFaqs: number;
    websites: number;
    websitePages: number;
  };
  files: {
    faqs: {
      id: number;
      rowMailboxId: number;
      enabled: boolean;
      suggested: boolean;
      file: string;
    }[];
    websitePages: {
      id: number;
      rowMailboxId: number;
      websiteId: number;
      websiteName: string;
      url: string;
      file: string;
    }[];
  };
};

const usage = () => {
  console.log(`Export knowledge bank entries and crawled website pages into a folder.

Usage:
  pnpm db:export-knowledge
  pnpm db:export-knowledge -- --out ./tmp/knowledge
  pnpm db:export-knowledge -- --mailbox-slug my-mailbox
  pnpm db:export-knowledge -- --mailbox-id 1

Options:
  --out           Output root directory. Defaults to ${DEFAULT_OUTPUT_DIR}
  --mailbox-id    Export a specific mailbox by numeric id
  --mailbox-slug  Export a specific mailbox by slug
  --help          Show this help
`);
};

const getArgValue = (args: string[], flag: string) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

const parseArgs = (): Args => {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    usage();
    process.exit(0);
  }

  const mailboxIdRaw = getArgValue(args, "--mailbox-id");
  const mailboxSlug = getArgValue(args, "--mailbox-slug");
  const outDir = getArgValue(args, "--out") ?? DEFAULT_OUTPUT_DIR;

  if (mailboxIdRaw && mailboxSlug) {
    throw new Error("Pass either --mailbox-id or --mailbox-slug, not both.");
  }

  if (mailboxIdRaw && !/^\d+$/.test(mailboxIdRaw)) {
    throw new Error(`Invalid --mailbox-id value: ${mailboxIdRaw}`);
  }

  return {
    mailboxId: mailboxIdRaw ? Number(mailboxIdRaw) : undefined,
    mailboxSlug,
    outDir,
  };
};

const slugify = (value: string, fallback: string) => {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return ascii || fallback;
};

const extractTitle = (content: string, fallback: string) => {
  const firstNonEmptyLine = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);

  return (firstNonEmptyLine ?? fallback).slice(0, 80);
};

const serializeFrontmatterValue = (value: unknown) => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

const renderMarkdownDocument = (metadata: Record<string, unknown>, content: string) => {
  const frontmatter = Object.entries(metadata)
    .map(([key, value]) => `${key}: ${serializeFrontmatterValue(value)}`)
    .join("\n");

  return `---\n${frontmatter}\n---\n\n${content.trimEnd()}\n`;
};

const resolveMailbox = async ({ mailboxId, mailboxSlug }: Args) => {
  if (mailboxId !== undefined) {
    return await db.query.mailboxes.findFirst({
      where: eq(mailboxes.id, mailboxId),
    });
  }

  if (mailboxSlug) {
    return await db.query.mailboxes.findFirst({
      where: eq(mailboxes.slug, mailboxSlug),
    });
  }

  return await getMailbox();
};

const getIncludedMailboxIds = (mailboxId: number) => [...new Set([0, mailboxId])].sort((left, right) => left - right);

const exportFaqs = async (mailboxDir: string, knowledgeMailboxIds: number[]) => {
  const faqDir = path.join(mailboxDir, "faqs");
  await mkdir(faqDir, { recursive: true });

  const rows = await db
    .select({
      id: faqs.id,
      rowMailboxId: faqs.unused_mailboxId,
      content: faqs.content,
      enabled: faqs.enabled,
      suggested: faqs.suggested,
      suggestedReplacementForId: faqs.suggestedReplacementForId,
      messageId: faqs.messageId,
      sourceConversationId: faqs.sourceConversationId,
      usageCount: faqs.usageCount,
      lastUsedAt: faqs.lastUsedAt,
      createdAt: faqs.createdAt,
      updatedAt: faqs.updatedAt,
    })
    .from(faqs)
    .where(inArray(faqs.unused_mailboxId, knowledgeMailboxIds))
    .orderBy(asc(faqs.createdAt), asc(faqs.id));

  const exported = await Promise.all(
    rows.map(async (faq, index) => {
      const title = extractTitle(faq.content, `faq-${faq.id}`);
      const fileName = `${String(index + 1).padStart(4, "0")}-${faq.id}-${slugify(title, `faq-${faq.id}`)}.md`;
      const filePath = path.join(faqDir, fileName);

      await writeFile(
        filePath,
        renderMarkdownDocument(
          {
            type: "faq",
            id: faq.id,
            rowMailboxId: faq.rowMailboxId,
            enabled: faq.enabled,
            suggested: faq.suggested,
            suggestedReplacementForId: faq.suggestedReplacementForId,
            messageId: faq.messageId,
            sourceConversationId: faq.sourceConversationId,
            usageCount: faq.usageCount,
            lastUsedAt: faq.lastUsedAt?.toISOString() ?? null,
            createdAt: faq.createdAt.toISOString(),
            updatedAt: faq.updatedAt.toISOString(),
          },
          faq.content,
        ),
        "utf8",
      );

      return {
        id: faq.id,
        rowMailboxId: faq.rowMailboxId,
        enabled: faq.enabled,
        suggested: faq.suggested,
        file: path.relative(mailboxDir, filePath),
      };
    }),
  );

  return {
    rows,
    exported,
  };
};

const exportWebsitePages = async (mailboxDir: string, knowledgeMailboxIds: number[]) => {
  const pagesRootDir = path.join(mailboxDir, "website-pages");
  await mkdir(pagesRootDir, { recursive: true });

  const rows = await db
    .select({
      id: websitePages.id,
      rowMailboxId: websites.unused_mailboxId,
      websiteId: websitePages.websiteId,
      websiteCrawlId: websitePages.websiteCrawlId,
      url: websitePages.url,
      pageTitle: websitePages.pageTitle,
      markdown: websitePages.markdown,
      metadata: websitePages.metadata,
      createdAt: websitePages.createdAt,
      updatedAt: websitePages.updatedAt,
      websiteName: websites.name,
      websiteUrl: websites.url,
    })
    .from(websitePages)
    .innerJoin(websites, eq(websites.id, websitePages.websiteId))
    .where(
      and(
        inArray(websites.unused_mailboxId, knowledgeMailboxIds),
        isNull(websites.deletedAt),
        isNull(websitePages.deletedAt),
      ),
    )
    .orderBy(asc(websites.name), asc(websitePages.pageTitle), asc(websitePages.url), asc(websitePages.id));

  const exported = await Promise.all(
    rows.map(async (page, index) => {
      const websiteDirName = `${String(page.websiteId).padStart(4, "0")}-${slugify(page.websiteName, `website-${page.websiteId}`)}`;
      const websiteDir = path.join(pagesRootDir, websiteDirName);
      const title = extractTitle(page.pageTitle || page.markdown, `page-${page.id}`);
      const fileName = `${String(index + 1).padStart(4, "0")}-${page.id}-${slugify(title, `page-${page.id}`)}.md`;
      const filePath = path.join(websiteDir, fileName);

      await mkdir(websiteDir, { recursive: true });
      await writeFile(
        filePath,
        renderMarkdownDocument(
          {
            type: "website_page",
            id: page.id,
            rowMailboxId: page.rowMailboxId,
            websiteId: page.websiteId,
            websiteName: page.websiteName,
            websiteUrl: page.websiteUrl,
            websiteCrawlId: page.websiteCrawlId,
            url: page.url,
            pageTitle: page.pageTitle,
            metadata: page.metadata ?? null,
            createdAt: page.createdAt.toISOString(),
            updatedAt: page.updatedAt.toISOString(),
          },
          page.markdown,
        ),
        "utf8",
      );

      return {
        id: page.id,
        rowMailboxId: page.rowMailboxId,
        websiteId: page.websiteId,
        websiteName: page.websiteName,
        url: page.url,
        file: path.relative(mailboxDir, filePath),
      };
    }),
  );

  return {
    rows,
    exported,
  };
};

const run = async () => {
  const args = parseArgs();
  const mailbox = await resolveMailbox(args);

  if (!mailbox) {
    throw new Error("No mailbox found for the provided selector.");
  }

  const outputRoot = path.resolve(args.outDir);
  const mailboxDir = path.join(
    outputRoot,
    `${String(mailbox.id).padStart(4, "0")}-${slugify(mailbox.slug, `mailbox-${mailbox.id}`)}`,
  );
  const knowledgeMailboxIds = getIncludedMailboxIds(mailbox.id);

  await rm(mailboxDir, { recursive: true, force: true });
  await mkdir(mailboxDir, { recursive: true });

  const [{ rows: faqRows, exported: faqFiles }, { rows: pageRows, exported: pageFiles }] = await Promise.all([
    exportFaqs(mailboxDir, knowledgeMailboxIds),
    exportWebsitePages(mailboxDir, knowledgeMailboxIds),
  ]);

  const manifest: ExportManifest = {
    exportedAt: new Date().toISOString(),
    mailbox: {
      id: mailbox.id,
      name: mailbox.name,
      slug: mailbox.slug,
    },
    includedRowMailboxIds: knowledgeMailboxIds,
    counts: {
      faqs: faqRows.length,
      enabledFaqs: faqRows.filter((faq) => faq.enabled).length,
      suggestedFaqs: faqRows.filter((faq) => faq.suggested).length,
      websites: new Set(pageRows.map((page) => page.websiteId)).size,
      websitePages: pageRows.length,
    },
    files: {
      faqs: faqFiles,
      websitePages: pageFiles,
    },
  };

  await writeFile(path.join(mailboxDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Mailbox: ${mailbox.name} (${mailbox.slug})`);
  console.log(`Exported FAQs: ${manifest.counts.faqs}`);
  console.log(`Exported website pages: ${manifest.counts.websitePages} across ${manifest.counts.websites} website(s)`);
  console.log(`Output folder: ${mailboxDir}`);
  console.log(`Manifest: ${path.join(mailboxDir, "manifest.json")}`);
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to export knowledge:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
