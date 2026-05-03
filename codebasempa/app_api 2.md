Below is a concise map of the requested paths. Each module lists purpose, exports, and notable dependencies, plus entry points/data flow where relevant.

## app/types

### `app/types/global.d.ts`
- **Purpose:** Centralized shared types for conversations, FAQ, attachments, and draft emails based on tRPC outputs.
- **Exports:** `MetadataEndpoint`, `FAQ`, `DraftedEmail`, `Conversation`, `Message`, `Note`, `ConversationEvent`, `GuideSession`, `AttachedFile`, `ConversationListItem`.
- **Notable deps:** `UnsavedFileInfo` from `components/fileUploadContext`, `RouterOutputs` from `trpc`.
- **Gotcha:** Types rely on `RouterOutputs["mailbox"]...` so any API shape change ripples here.

## app/login

### `app/login/page.tsx`
- **Purpose:** Auth entry page deciding between onboarding vs login based on mailbox presence.
- **Exports:** default server component; `dynamic = "force-dynamic"`.
- **Notable deps:** `db.query.mailboxes`, `TRPCReactProvider`, `LoginForm`, `OnboardingForm`.
- **Entry point:** Next.js page at `/login`; data flow is DB check → choose client form component.

### `app/login/onboardingForm.tsx`
- **Purpose:** First-time onboarding to create account and verify OTP.
- **Exports:** `OnboardingForm` client component.
- **Notable deps:** `api.user.onboard` mutation, Supabase `auth.verifyOtp`, `next-themes`, UI primitives.
- **Data flow:** Form → tRPC `user.onboard` → OTP returned → Supabase verify → redirect to `/mine`.

### `app/login/loginForm.tsx`
- **Purpose:** Multi-step login/signup flow (email → display name → OTP).
- **Exports:** `LoginForm` client component.
- **Notable deps:** `api.user.startSignIn` + `api.user.createUser`, Supabase `verifyOtp`, `env`, `captureExceptionAndLog`.
- **Data flow:** Email check → possibly create user → OTP verify → redirect to `/mine`.
- **Gotcha:** Auto-submits OTP when length is 8; uses `dashboardUrl` fallback for OTP in dev/resend missing.

## app/widget

### `app/widget/layout.tsx`
- **Purpose:** Root layout for widget routes; sets metadata/viewport and wrappers.
- **Exports:** `metadata`, `viewport`, default `RootLayout`.
- **Notable deps:** global CSS, `NuqsAdapter`, `@vercel/analytics`.
- **Entry point:** Layout for `/widget/*`.

### `app/widget/[name]/route.tsx`
- **Purpose:** Serves `public/sdk*.js` with runtime env substitution.
- **Exports:** `GET`, `OPTIONS`.
- **Notable deps:** `fs/promises`, `env`, `NextResponse`.
- **Entry point:** Route handler for `/widget/:name`; enforces filename pattern and CORS.
- **Gotcha:** Only matches `sdk[-?]*.js`; rejects others with 404.

### `app/widget/embed/layout.tsx`
- **Purpose:** Wrapper layout for embedded widget UI.
- **Exports:** `metadata`, default `EmbedLayout`.
- **Notable deps:** `./globals.css`.

### `app/widget/embed/globals.css`
- **Purpose:** Widget-specific styles and loading animation.
- **Exports:** CSS classes (`.bg-widget`, `.ball-*`, `.helper-widget-wrapper`, `.responsive-chat`).
- **Gotcha:** Uses hardcoded colors and borders; behavior changes at 640px breakpoint.

### `app/widget/embed/page.tsx`
- **Purpose:** Main embedded widget client UI (chat/history, prompt details, guide resume).
- **Exports:** default client `Page`.
- **Notable deps:** `@helperai/sdk` message types, widget components/hooks, `sendReadyMessage`, `eventBus/messageQueue`, `useReadPageTool`, `useScreenshotStore`.
- **Entry point/data flow:** Receives `postMessage` from parent (CONFIG, PROMPT, START_GUIDE, RESUME_GUIDE, SCREENSHOT, OPEN_CONVERSATION) → updates state → renders `Conversation` or `PreviousConversations`.

## app/api

### app/api/widget

#### `app/api/widget/utils.ts`
- **Purpose:** Shared widget auth + CORS helpers.
- **Exports:** `corsOptions`, `corsResponse`, `authenticateWidget`, `withWidgetAuth`.
- **Notable deps:** `getMailbox`, `verifyWidgetSession`, `mailboxes` schema.
- **Gotcha:** `withWidgetAuth` handles `OPTIONS` and enforces Bearer token; relies on a single mailbox via `getMailbox`.

#### `app/api/widget/session/route.ts`
- **Purpose:** Create widget session token and return config/notifications.
- **Exports:** `OPTIONS`, `POST`.
- **Notable deps:** `sessionParamsSchema`, `createWidgetSession`, `getEmailHash`, `getPlatformCustomer`, `fetchAndUpdateUnsentNotifications`, env.
- **Data flow:** Validate body → mailbox fetch → optional HMAC validation → create session → return token + Supabase keys + notifications.

#### `app/api/widget/notification/[id]/route.ts`
- **Purpose:** Mark widget notifications read/dismissed.
- **Exports:** `OPTIONS`, `PATCH`.
- **Notable deps:** `messageNotifications`, `platformCustomers`, `zod` schema, `withWidgetAuth`.
- **Gotcha:** Anonymous sessions are rejected (requires `session.email`).

#### `app/api/widget/read-page-tool/route.ts`
- **Purpose:** Generate AI tool config to read page HTML.
- **Exports:** `POST`.
- **Notable deps:** `generateReadPageTool`, `withWidgetAuth`, `zod`.
- **Data flow:** Validate HTML/URL → generate tool using session email.

### app/api/guide

#### `app/api/guide/start/route.ts`
- **Purpose:** Start a guide session and create/attach a conversation.
- **Exports:** `POST`.
- **Notable deps:** `generateGuidePlan`, `createConversation`, `createGuideSession`, `findOrCreatePlatformCustomerByEmail`, `waitUntil`.
- **Data flow:** Generate plan → get/create conversation → create guide session + async event.

#### `app/api/guide/action/route.ts`
- **Purpose:** AI agent action planner for interactive guides.
- **Exports:** `POST`.
- **Notable deps:** `@ai-sdk/openai`, `streamText`, `tool` schema, `getGuideSessionActions`.
- **Data flow:** Rebuild tool-call messages from past actions → append user message → stream tool-call response.
- **Gotcha:** Uses custom tool schema (`AgentOutput`) and `experimental_repairToolCall`.

#### `app/api/guide/event/route.ts`
- **Purpose:** Record guide session events or replays.
- **Exports:** `OPTIONS`, `POST`.
- **Notable deps:** `guideSessions`, `guideSessionReplays`, `createGuideSessionEvent`, `updateGuideSession`, `zod`.
- **Data flow:** If recording, insert replay rows; else parse events and update completion.

#### `app/api/guide/resume/route.ts`
- **Purpose:** Resume a guide session for a customer.
- **Exports:** `OPTIONS`, `POST`.
- **Notable deps:** `getGuideSessionByUuid`, `getConversationById`.
- **Gotcha:** Enforces customer email match with guide session.

#### `app/api/guide/update/route.ts`
- **Purpose:** Update guide steps completion status.
- **Exports:** `POST`.
- **Notable deps:** `updateGuideSession`, `zod` schema, `GuideSession` type.
- **Gotcha:** Email check to ensure session ownership.

### app/api/connect

#### `app/api/connect/google/utils.ts`
- **Purpose:** OAuth helpers for Gmail integration.
- **Exports:** `auth`, `connectSupportEmailUrl`.
- **Notable deps:** `googleapis`, `GMAIL_AUTHORIZATION_PARAMS`, env.

#### `app/api/connect/google/route.ts`
- **Purpose:** Redirect to Google OAuth.
- **Exports:** `GET`.
- **Notable deps:** `connectSupportEmailUrl`.

#### `app/api/connect/google/callback/route.ts`
- **Purpose:** OAuth callback to save Gmail credentials.
- **Exports:** `GET`.
- **Notable deps:** `auth`, `gmailScopesGranted`, `api.gmailSupportEmail.create`.
- **Gotcha:** Redirects back to auth URL if scopes missing.

#### `app/api/connect/github/callback/route.ts`
- **Purpose:** GitHub App installation callback.
- **Exports:** `GET`.
- **Notable deps:** `listRepositories`, `getMailbox`, `db.update(mailboxes)`.
- **Data flow:** Verify installation by listing repos → store `githubInstallationId`.

#### `app/api/connect/slack/callback/route.ts`
- **Purpose:** Slack OAuth callback storing bot/team credentials.
- **Exports:** `GET`.
- **Notable deps:** `getSlackAccessToken`, `createClient` (Supabase auth), `db.update(mailboxes)`.

### app/api/chat

#### `app/api/chat/getConversation.ts`
- **Purpose:** Authorize and fetch a conversation by slug.
- **Exports:** `getConversation`.
- **Notable deps:** `getConversationBySlugAndMailbox`, `WidgetSessionPayload`.
- **Gotcha:** Debug logging includes session data.

#### `app/api/chat/customerFilter.ts`
- **Purpose:** Build Drizzle filters for customer-specific conversation access.
- **Exports:** `getCustomerFilter`, `getCustomerFilterForSearch`.
- **Notable deps:** `conversations` schema, `WidgetSessionPayload`.
- **Gotcha:** Returns `null` if session has neither email nor anonymousSessionId.

#### `app/api/chat/route.ts`
- **Purpose:** Widget chat streaming endpoint with AI response.
- **Exports:** `OPTIONS`, `POST`, `maxDuration`.
- **Notable deps:** `respondWithAI`, `createUserMessage`, `validateAttachments`, `storeTools`, `publishToRealtime`.
- **Data flow:** Validate message/attachments → create user message → AI response → update subject and realtime.
- **Gotcha:** Updates `mailboxes.customerInfoUrl` when provided.

#### `app/api/chat/contact/route.ts`
- **Purpose:** Contact form submission endpoint.
- **Exports:** `OPTIONS`, `POST`.
- **Notable deps:** `createConversation`, `createConversationMessage`, `generateConversationSubject`, `triggerEvent`.
- **Data flow:** Transaction create conversation + message → async subject/auto-response.

#### `app/api/chat/conversation/route.ts`
- **Purpose:** Create a new chat conversation.
- **Exports:** `OPTIONS`, `POST`.
- **Notable deps:** `createConversationBodySchema`, `getPlatformCustomer`, `CHAT_CONVERSATION_SUBJECT`.
- **Gotcha:** VIP customers can force `open` status.

#### `app/api/chat/conversation/[slug]/route.ts`
- **Purpose:** Fetch or mark read a conversation; expose guide sessions.
- **Exports:** `OPTIONS`, `GET`, `PATCH`.
- **Notable deps:** `getCustomerFilter`, `serializeMessageForWidget`, `updateConversation`.
- **Data flow:** Filter by session → fetch messages → attach files → return active guide sessions.

#### `app/api/chat/conversation/[slug]/message/route.ts`
- **Purpose:** Post a message to an existing conversation.
- **Exports:** `OPTIONS`, `POST`, `maxDuration`.
- **Notable deps:** `createUserMessage`, `triggerEvent`, `validateAttachments`, `storeTools`.
- **Data flow:** Validate → save message → trigger auto-response job.

#### `app/api/chat/conversation/[slug]/message/[id]/route.ts`
- **Purpose:** React to a message (thumbs up/down + feedback).
- **Exports:** `OPTIONS`, `POST`.
- **Notable deps:** `reactMessageBodySchema`, `publishToRealtime`, `createReactionEventPayload`.
- **Data flow:** Validate reaction → update DB → publish dashboard event.

#### `app/api/chat/conversation/[slug]/message/[id]/event/route.ts`
- **Purpose:** Record message-level events (currently reasoning toggle).
- **Exports:** `POST`.
- **Notable deps:** `conversationEvents`, `zod` schema.

#### `app/api/chat/conversations/route.ts`
- **Purpose:** Paginated conversation list for customer.
- **Exports:** `OPTIONS`, `GET`.
- **Notable deps:** `searchConversations`, `customerSearchSchema`, `conversationMessages`.
- **Data flow:** Parse search → query search index → count messages → return list.

#### `app/api/chat/conversations/unread/route.ts`
- **Purpose:** Count unread conversations for customer.
- **Exports:** `OPTIONS`, `GET`.
- **Notable deps:** `conversationMessages`, `conversations`, Drizzle `exists` clause.

### app/api/trpc

#### `app/api/trpc/lambda/[trpc]/route.ts`
- **Purpose:** tRPC fetch handler for lambda-style endpoint.
- **Exports:** `OPTIONS`, `GET`, `POST`.
- **Notable deps:** `fetchRequestHandler`, `createTRPCContext`, Supabase auth, `getProfile`.

### app/api/job

#### `app/api/job/route.ts`
- **Purpose:** Secure job runner endpoint for cron/event jobs.
- **Exports:** `POST`, `maxDuration`.
- **Notable deps:** HMAC verification, `cronJobs`, `eventJobs`, `jobRuns`, `superjson`, `waitUntil`.
- **Data flow:** Verify signature → create/update jobRuns → dispatch job handler asynchronously.
- **Gotcha:** Enforces 5-minute timestamp window; header `x-timestamp` required.

### app/api/webhooks

#### `app/api/webhooks/gmail/route.ts`
- **Purpose:** Gmail webhook receiver.
- **Exports:** `POST`.
- **Notable deps:** `triggerEvent("gmail/webhook.received")`.
- **Gotcha:** Very verbose logging of payload/headers.

#### `app/api/webhooks/slack/event/route.ts`
- **Purpose:** Slack events webhook (mentions, DMs, assistant threads, link unfurl).
- **Exports:** `POST`.
- **Notable deps:** `verifySlackRequest`, `findMailboxForEvent`, `handleMessage`, `handleAssistantThreadMessage`, `handleSlackUnfurl`, `disconnectSlack`.
- **Data flow:** Verify signature → route by event type → `waitUntil` handlers.

#### `app/api/webhooks/slack/response/route.ts`
- **Purpose:** Slack interactive responses (buttons/modals).
- **Exports:** `POST`.
- **Notable deps:** `handleAgentMessageSlackAction`, `handleMessageSlackAction`, `handleKnowledgeBankSlackAction`.
- **Data flow:** Parse payload → locate agent or conversation message → dispatch to handlers.

#### `app/api/webhooks/github/route.ts`
- **Purpose:** GitHub webhook for issue state changes.
- **Exports:** `POST`.
- **Notable deps:** HMAC verification, `createReply`, `addNote`, `conversations` updates.
- **Data flow:** On issue closed/reopened → update linked conversations.

#### `app/api/webhooks/firecrawl/route.ts`
- **Purpose:** Firecrawl crawl lifecycle webhooks.
- **Exports:** `POST`.
- **Notable deps:** `websiteCrawls`, `websitePages`, `generateEmbedding`.
- **Data flow:** Handle `crawl.started/page/completed/failed` → update crawl status and pages.

## Key relationships
- Widget flow: `/api/widget/session` issues JWT → widget embed uses token → all widget APIs go through `withWidgetAuth` and `getCustomerFilter`/`getConversation`.
- Chat AI loop: `/api/chat` + `/api/chat/conversation/*` create messages → `respondWithAI` or `triggerEvent` job → realtime updates via `publishToRealtime`.
- Guide flow: `/api/guide/start` creates guide session → `/api/guide/action` streams next tool action → `/api/guide/event/update/resume` persists progress.
- Integrations: OAuth callbacks (Google/Slack/GitHub) write mailbox settings → webhooks (Slack/Gmail/GitHub/Firecrawl) trigger jobs or DB updates.
- Patterns/gotchas: CORS handled centrally for widget APIs; many endpoints `waitUntil` background work; several modules log sensitive session data for debugging (`getConversation`, `getCustomerFilter`, Gmail webhook).