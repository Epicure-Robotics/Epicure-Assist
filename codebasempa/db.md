## db/client.ts
- Purpose/exports: builds a Drizzle client over `pg` with pooled connections; exports `createDbClient`, `db`, `Transaction`, `TransactionOrDb`.
- Notable deps/gotchas: merges `@/db/schema` + `@/db/supabaseSchema/auth` into `fullSchema`, replaces `sslmode=require` with `no-verify`, sets `statement_timeout`, caches `db` on `global` in non-prod.

## db/drizzle.config.ts
- Purpose/exports: Drizzle Kit config for migrations (`schema` = `db/schema`, `out` = `db/drizzle`, `snake_case`); default export.
- Notable deps/gotchas: rewrites `sslmode` in production due to self-signed cert issues; uses `env.DATABASE_URL || env.POSTGRES_URL`.

## db/setupCron.ts
- Purpose/exports: script entry point to create job functions and schedule cron jobs from `@/jobs`.
- Notable deps/gotchas: top-level `await`; depends on `db/lib/cronUtils` and `cronJobs`.

## db/lib/crypto.ts
- Purpose/exports: `symmetricEncrypt`/`symmetricDecrypt` AES256 helpers for hex-encoded ciphertext with IV prefix.
- Notable deps/gotchas: expects 32‑byte key; uses `latin1` Buffer conversion and `iv:ciphertext` format.

## db/lib/debug.ts
- Purpose/exports: `explainAnalyze` wrapper that logs `EXPLAIN ANALYZE` for a Drizzle query.
- Notable deps/gotchas: uses `db.execute(sql\`EXPLAIN ANALYZE ...\`)`, logs via `console.debug`.

## db/lib/random-slug-field.ts
- Purpose/exports: `randomSlugField` helper for `varchar` slug with default `generateSlug`.
- Notable deps/gotchas: depends on `@/lib/shared/slug`.

## db/lib/with-timestamps.ts
- Purpose/exports: `withTimestamps` column mixin for `createdAt`/`updatedAt` with defaults and `onUpdate`.
- Notable deps/gotchas: used across most tables for consistency.

## db/lib/cronUtils.ts
- Purpose/exports: `setupCron`, `cleanupOldCronJobs`, `setupJobFunctions` to manage pg_cron + pgmq job processing.
- Notable deps/gotchas: installs `call_job_endpoint` + `process_jobs` SQL functions, schedules `process-jobs` every 5s, uses Supabase Vault secret `JOBS_HMAC`, posts to `/api/job` with HMAC headers.

## db/schema/index.ts
- Purpose/exports: re-exports all schema modules for `db/client.ts` and app use.
- Notable deps/gotchas: central entry for Drizzle schema aggregation.

## db/schema/mailboxes.ts
- Purpose/exports: `mailboxes` table + `mailboxesRelations` for workspace settings.
- Notable deps/gotchas: uses `withTimestamps`; relations to `gmailSupportEmails` and `faqs`; `unused_mailboxId` pattern appears elsewhere.

## db/schema/gmailSupportEmails.ts
- Purpose/exports: `gmailSupportEmails` table + relations to `mailboxes`.
- Notable deps/gotchas: indexed `email` plus `text_pattern_ops` workaround comment.

## db/schema/conversations.ts
- Purpose/exports: `conversations` table + relations for tickets, embeddings, assignment, merge tracking, suggested actions.
- Notable deps/gotchas: `randomSlugField`, `withTimestamps`, HNSW vector index, self‑relation for merges, conditional indexes using `assertDefined`.

## db/schema/conversationEvents.ts
- Purpose/exports: `conversationEvents` table + relations; audit trail for status/assignment changes.
- Notable deps/gotchas: typed `changes` JSON; indexed by conversation, user, type.

## db/schema/conversationMessages.ts
- Purpose/exports: `conversationMessages` table + relations, `MessageRole`, `MessageMetadata`, `ToolMetadata`, `DRAFT_STATUSES`.
- Notable deps/gotchas: search index via `string_to_array` GIN; draft/reaction fields; references `PromptInfo`, `CustomerInfo`, `files`, `messageNotifications`.

## db/schema/conversationFollowers.ts
- Purpose/exports: `conversationFollowers` table + relations to conversations/users.
- Notable deps/gotchas: references `authUsers` and `userProfiles` via `uuid` user id.

## db/schema/mailboxesMetadataApi.ts
- Purpose/exports: `unused_mailboxesMetadataApi` table + relations for metadata API configs.
- Notable deps/gotchas: legacy `unused_mailboxId` naming; soft delete via `deletedAt`.

## db/schema/faqs.ts
- Purpose/exports: `faqs` table + relations for FAQ snippets and embeddings.
- Notable deps/gotchas: vector index; optional link to `conversationMessages` via `messageId`.

## db/schema/platformCustomers.ts
- Purpose/exports: `platformCustomers` table + relations; stores customer metadata/value.
- Notable deps/gotchas: trigram GIN index on email; `unused_mailboxId` default.

## db/schema/files.ts
- Purpose/exports: `files` table + relations; attachments for messages/notes.
- Notable deps/gotchas: `randomSlugField` slug; `isInline`/`isPublic` flags.

## db/schema/notes.ts
- Purpose/exports: `notes` table + relations; internal notes on conversations.
- Notable deps/gotchas: `files` relation; indexes on conversation/user.

## db/schema/aiUsageEvents.ts
- Purpose/exports: `aiUsageEvents` table + relations; token/cost tracking by model/query type.
- Notable deps/gotchas: typed `queryType` union; indexed on model and query type.

## db/schema/messageNotifications.ts
- Purpose/exports: `messageNotifications` table + relations; outbound notification tracking per message.
- Notable deps/gotchas: `platformCustomer` relation references `platformCustomers.email` despite `platformCustomerId` being bigint (possible mismatch to watch).

## db/schema/pushSubscriptions.ts
- Purpose/exports: `pushSubscriptions` table + relations; web push subscription storage.
- Notable deps/gotchas: unique `(userId, endpoint)`; linked to `authUsers` + `userProfiles`.

## db/schema/webNotifications.ts
- Purpose/exports: `webNotifications` table + relations; in-app/push notifications.
- Notable deps/gotchas: links to `conversationMessages` and `notes` optionally.

## db/schema/websites.ts
- Purpose/exports: `websites`, `websitePages`, `websiteCrawls` tables + relations for knowledge base crawling.
- Notable deps/gotchas: vector index on pages; `CrawlMetadata` interface used for JSON schema.

## db/schema/toolApis.ts
- Purpose/exports: `toolApis` table + relations; exports `toolApis` and `ToolApi`.
- Notable deps/gotchas: references `tools` and `mailboxes`; optional `schema` field.

## db/schema/tools.ts
- Purpose/exports: `tools` table + relations; exports `Tool`, `ToolParameter` types.
- Notable deps/gotchas: JSON `headers`/`parameters`, `toolApiId` link, unique slug index.

## db/schema/guideSession.ts
- Purpose/exports: `guideSessions`, `guideSessionEvents`, `guideSessionReplays` tables + enums and relations.
- Notable deps/gotchas: uses `pgEnum` for status/event types; stores steps as JSON array.

## db/schema/agentThreads.ts
- Purpose/exports: `agentThreads` table + relations; Slack thread grouping for agent conversations.
- Notable deps/gotchas: indexed on `slackChannel` + `threadTs`.

## db/schema/agentMessages.ts
- Purpose/exports: `agentMessages` table + relations; stores LLM agent messages.
- Notable deps/gotchas: unique Slack `(slackChannel, messageTs)`.

## db/schema/cache.ts
- Purpose/exports: `cache` table; generic key/value cache with expiry.
- Notable deps/gotchas: unique key index; no relations.

## db/schema/jobRuns.ts
- Purpose/exports: `jobRuns` table; job execution tracking with status/result.
- Notable deps/gotchas: status enum stored as text; indexed on job/status.

## db/schema/userProfiles.ts
- Purpose/exports: `userProfiles` table + relations; user metadata/settings; exports `AccessRole`, `BasicUserProfile`, `FullUserProfile`.
- Notable deps/gotchas: created via Postgres trigger (see comment); references `authUsers` with `onDelete: cascade`.

## db/schema/savedReplies.ts
- Purpose/exports: `savedReplies` table + relations; canned responses; exports `SavedReply`.
- Notable deps/gotchas: `randomSlugField`; unique slug per mailbox.

## db/schema/issueGroups.ts
- Purpose/exports: `issueGroups` table + relations; ML/heuristic grouping of conversations.
- Notable deps/gotchas: vector index on `embedding`; assignee rotation via `lastAssignedIndex`.

## db/schema/issueGroupConditions.ts
- Purpose/exports: `issueGroupConditions` table + relations; ties issue groups to saved replies with AI conditions.
- Notable deps/gotchas: cascades on delete for group/reply.

## db/schema/storedTools.ts
- Purpose/exports: `storedTools` table; per-customer tool storage; exports `StoredTool`, `StoredToolParameter`.
- Notable deps/gotchas: unique `(name, customerEmail)` and partial index on non-null emails.

## db/supabaseSchema/auth.ts
- Purpose/exports: defines `authUsers`, `authIdentities`, and `DbOrAuthUser` for Supabase auth schema subset.
- Notable deps/gotchas: subset only; `user_metadata` maps to `raw_user_meta_data`.

## db/seeds/index.ts
- Purpose/exports: seed entry point that guards env and calls `seedDatabase`.
- Notable deps/gotchas: exits early outside dev/preview.

## db/seeds/seedDatabase.ts
- Purpose/exports: `seedDatabase` plus script execution; seeds mailboxes, users, FAQs, help articles, fixtures, and indexes messages.
- Notable deps/gotchas: uses test factories and `indexConversationMessage`; optional `localSeeds.ts`; file also self-invokes at bottom (second entry point).

## db/seeds/helpArticlesData.ts
- Purpose/exports: static `helpArticlesData` array for seed docs.
- Notable deps/gotchas: used by `seedDatabase` to create website pages.

## db/seeds/fixtures/*.json
- Purpose/exports: conversation fixture data (`conversation` + `messages` per id) used by `seedDatabase`.
- Notable deps/gotchas: files include `conversationFixture3.json`, `conversationFixture4.json`, `conversationFixture6.json`, `conversationFixture7.json`, `conversationFixture8.json`, `conversationFixture11.json`, `conversationFixture12.json`, `conversationFixture14.json`, `conversationFixture15.json`, `conversationFixture16.json`, `conversationFixture18.json`, `conversationFixture19.json`, `conversationFixture20.json`, `conversationFixture21.json`, `conversationFixture22.json`, `conversationFixture23.json`, `conversationFixture24.json`, `conversationFixture25.json`, `conversationFixture26.json`, `conversationFixture27.json`, `conversationFixture28.json`, `conversationFixture29.json`, `conversationFixture30.json`, `conversationFixture31.json`, `conversationFixture32.json`, `conversationFixture33.json`, `conversationFixture35.json`, `conversationFixture36.json`, `conversationFixture37.json`, `conversationFixture38.json`, `conversationFixture62.json`, `conversationFixture63.json`, `conversationFixture64.json`, `conversationFixture65.json`, `conversationFixture66.json`, `conversationFixture67.json`.

## Key relationships
- Schema aggregation: `db/client.ts` composes `@/db/schema` + `@/db/supabaseSchema/auth`, so all table modules are part of the runtime DB type.
- Core data flow: `conversations` → `conversationMessages` → `files`/`messageNotifications`; `conversations` → `conversationEvents`/`conversationFollowers`/`issueGroups`.
- Knowledge base flow: `websites` → `websiteCrawls` → `websitePages` (seeded by `db/seeds/seedDatabase.ts` via `helpArticlesData`).
- Jobs/cron flow: `db/setupCron.ts` + `db/lib/cronUtils.ts` create functions and schedule pg_cron to invoke `/api/job` with HMAC; `jobRuns` tracks execution.
- Seeding flow: `db/seeds/index.ts` and `db/seeds/seedDatabase.ts` are both runnable entry points; fixtures + test factories populate tables and trigger `indexConversationMessage`.