# Epicure Inbox

Internal **draft-first** inbox for **Epicure Robotics**: website contact-form leads arrive in Gmail (`connect@epicurerobotics.com`), are categorized, and get AI **drafts** for human review before send.

Upstream code is MIT-licensed; this deployment is **Epicure-only** (no Gumroad/Helper production data or branding).

**Database:** All application data lives in **Supabase**—a managed **PostgreSQL** database (accessed with Drizzle ORM). This is **not** MongoDB. Dev/prod isolation = **two Supabase projects** (or local Supabase CLI + one cloud project), each with its own API keys and **Database** connection strings—never point dev and prod at the same project in production.

## Deployment

Use **Supabase** for auth + Postgres, plus Gmail OAuth and Google Cloud Pub/Sub for inbox sync. Set `INITIAL_USER_EMAILS` to real Epicure admin addresses (comma-separated). The default `epicure-seed@example.com` is for local seeds and Playwright only—keep it in sync with `tests/e2e/constants.ts` if you change it.

### Dev vs production (two deploys)

| | **Production** | **Dev / staging** |
|--|----------------|-------------------|
| **Supabase** | Dedicated **production** project: API URL, anon + service role keys, pooler + direct Postgres URLs | Dedicated **dev/preview** project (or local Supabase)—different `NEXT_PUBLIC_SUPABASE_*` and `POSTGRES_*` |
| **Gmail inbox** | `connect@epicurerobotics.com` (OAuth in app) | e.g. `tn717473@gmail.com` (separate OAuth connection) |
| **Env** | Vercel **Production** env vars | **Preview** or separate Vercel project—see [`.env.example`](.env.example) |

Set `EPICURE_DEPLOYMENT=production` or `preview`/`local`, and `EPICURE_PRIMARY_SUPPORT_EMAIL` to the same address you connect in **Settings → Integrations** for that deploy. Form-lead detection compares `From:` to the **live** connected mailbox from the database; the env var documents intent and helps your team stay consistent.

**Your checklist per environment:** one Supabase project (API + **Database** connection strings), `AUTH_URL`, Google OAuth + Pub/Sub, `OPENAI_API_KEY`, and a **job worker** using the **same** `POSTGRES_URL` as the app (Supabase pooler) so `pgmq` jobs run. Copy variable names from [`.env.example`](.env.example).

### How to test that it works

1. **Supabase & worker:** Run migrations against that project’s **direct** DB URL (`POSTGRES_URL_NON_POOLING` or `DATABASE_URL`); run the **job worker** against the **same Supabase project** (same `POSTGRES_URL` pooler) so `gmail/import-gmail-threads` and webhook jobs run.
2. **Gmail:** Complete OAuth for the support inbox used in that environment; confirm the row exists in `gmail_support_emails`.
3. **Live message:** From your site (or a manual email), send a message **From** that same support address with a subject like **“New Lead”** or **“Contact form”**—it should open a conversation. Alternatively run `pnpm import:epicure-website-leads` and confirm new threads appear after the worker runs.
4. **Unit tests:** `pnpm test:unit -- tests/lib/leads/formLeadDetection.test.ts` (no Docker if your Vitest setup allows; full suite may need containers per project docs).

### Configuration (single place for vars)

- Template: **[`.env.example`](.env.example)** — copy to **`.env.local`** for local development with all keys in one file.
- Scripts resolve env in this order (later overrides): `.env.production` → `.env.development.local` → `.env.local` (see `package.json` → `with-dev-env`).
- On Vercel, use the dashboard **Environment Variables** per environment (Production vs Preview) instead of a file.

## Behavior

- **Form-only ingestion:** Gmail ingests messages that look like **website notifications**: distinctive subject (e.g. contains `New Lead`, `Business Inquiry`, `Contact form`, `Website inquiry`) **and** `From:` equals your connected support address (e.g. `connect@epicurerobotics.com`). Everything else is skipped unless the sender is a staff user in your team. See [`lib/leads/formLeadDetection.ts`](lib/leads/formLeadDetection.ts).
- **Landing page auto-reply:** If your site already sends a “Thank you” on submit, **do not** duplicate that in the first human-approved reply.
- **Optional seed:** `EPICURE_SEED=1` before `pnpm db:seed` loads default lead categories and FAQ stubs—see [`db/seeds/epicureLeadContent.ts`](db/seeds/epicureLeadContent.ts).
- **Backlog import:** Run `pnpm import:epicure-website-leads [gmailSupportEmailId] [daysBack]` to queue gated imports (preset query in [`lib/epicure/websiteLeadGmailQuery.ts`](lib/epicure/websiteLeadGmailQuery.ts)). Or call `importGmailThreads` with the same `gmailQuerySuffix`. Adjust phrases there if your live subjects differ.
- **Refresh categories without re-seed:** `pnpm sync:epicure-issue-groups` updates titles/descriptions/colors and default saved-reply bodies from [`lib/epicure/issueGroupSpecs.ts`](lib/epicure/issueGroupSpecs.ts).
- **CLI scripts vs full app env:** `import:epicure-website-leads` and `sync:epicure-issue-groups` need only **Supabase Postgres** (via `POSTGRES_URL` or `DATABASE_URL`, or local Supabase defaults). They do **not** require `OPENAI_API_KEY`; ensure a **job worker** is running against the same Supabase DB to process `gmail/import-gmail-threads` after import.
- **Send throttle:** 30 sends/hour—see [`lib/leads/sendThrottle.ts`](lib/leads/sendThrottle.ts).

## Lead workflow (Epicure Robotics)

1. **Connect Gmail** in Settings → Integrations for this environment’s inbox (production: `connect@epicurerobotics.com`; dev: your test Gmail such as `tn717473@gmail.com`).
2. **Issue groups** (seeded or in Settings → Common issues): *Business Lead*, *Vendor / Manufacturer Pitch*, *Partnership*, *Hiring*, *Press / Media*, *Other*. AI assigns one group per conversation using [`jobs/categorizeConversationToIssueGroup.ts`](jobs/categorizeConversationToIssueGroup.ts).
3. **Draft-first replies:** Mailbox preference `autoRespondEmailToChat: "draft"` (set by seed) creates **AI drafts**, not auto-sent emails. Review in the conversation view, edit, then send.
4. **Auto-reply (optional):** Set **Auto-response** on specific issue groups if you want the system to send without a draft (use sparingly; conflicts with strict draft-only mode—prefer drafts for lead quality).
5. **Assignment by role:** Add **assignees** (Clerk user IDs) on each issue group; `autoAssignConversation` round-robins. Use **CORE** vs **NON_CORE** members + **keywords** in user profile for smarter routing (sales vs ops).
6. **Templates:** Each seeded group links a **saved reply** with `{{name}}`, `{{specific_use_case}}`, `{{deal_size_hint}}` placeholders for AI fill-in when conditions match.

## Quick start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Node.js](https://nodejs.org/) (see [`.node-version`](.node-version))

### Local HTTPS (mkcert)

```sh
brew install mkcert nss   # macOS
```

On Windows: `choco install mkcert` (requires [Chocolatey](https://chocolatey.org/install)).

### Environment

Copy [`.env.example`](.env.example) to `.env.local` and point at **your Supabase project** (hosted dev + hosted prod, or local CLI + cloud). Use **Epicure** Gmail OAuth clients and secrets—never upstream production credentials.

### Run

```sh
pnpm install
pnpm db:reset   # local Supabase in Docker + migrations + seed — OR use a dev Supabase project only + `pnpm db:migrate` + `pnpm db:seed`
pnpm dev
```

Open the URL printed in the terminal (local dev typically uses HTTPS on `helperai.dev` after mkcert, or your configured `AUTH_URL`).

### Local Supabase won’t start (`cannot parse 'api.port' as uint`)

That happens when port fields in `supabase/config.toml` use `env(...)` and the CLI does not substitute them—it tries to parse the literal text `env(LOCAL_SUPABASE_API_PORT)` as a number. This repo uses **numeric** defaults in `supabase/config.toml` (`54321`–`54327`) and `project_id = "helper"` (Docker network `supabase_network_helper`). Start **Docker Desktop**, then run `pnpm db:reset` again.

## License

See [LICENSE.md](LICENSE.md) (MIT; includes upstream copyright).
