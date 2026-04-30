---
name: pocket-helper-skills
description: Use this skill for operational Helper ticket work from the repo list a staff member's queue, get a customer's latest active ticket, search tickets, fetch a ticket timeline, find similar historical tickets, reply and close a ticket, change ticket status, or assign and unassign a ticket. Prefer this skill when the task should reuse existing Helper backend behavior instead of ad hoc lookups.
---

# Pocket Helper Skills

This skill gives agents a deterministic way to inspect and operate Helper tickets from the terminal while reusing the app's existing backend logic.

Use it when the user wants ticket operations such as:

- looking at a teammate's queue or latest assigned ticket
- finding the latest active ticket for a customer email
- searching tickets by text, structured operators, order number, or tracking number
- fetching the complete timeline for a specific ticket
- fetching Shopify customer or order data
- fetching Pocket user information
- searching historical tickets by full-text query
- replying to a ticket and closing it
- changing ticket status
- assigning, reassigning, or unassigning a ticket

## Why This Skill Exists

These scripts intentionally call the existing Helper data layer instead of duplicating business logic:

- `searchConversations` for ticket filtering and search
- `searchEmailsByKeywords` for full-text ticket matching
- `getMessages` for complete ticket timelines
- `getCustomerOrdersByEmail` and `searchOrderByName` for Shopify lookups
- `getPocketUserByEmail` for Pocket account lookups
- `createReply` for reply and close behavior
- `updateConversation` for status and assignment changes

That preserves existing side effects such as:

- conversation event logging
- assignment-related behavior
- AI auto-response toggles
- close-time side effects
- realtime publication and notifications

Prefer these scripts over raw DB updates unless you are explicitly debugging the underlying implementation.

## How To Use The Skill

### Step 1: Identify the exact operation

Start with this routing table. Use exactly one of these lookup scripts first:

- Staff queue or latest assigned ticket: `get-open-tickets.ts`
  Use when the identifier is a Helper staff member.
- Customer's latest active ticket: `get-customer-latest-ticket.ts`
  Use when the identifier is the customer's email.
- Ticket search: `find-tickets.ts`
  Use when you have keywords, order numbers, tracking numbers, or structured search operators.
- Current ticket timeline: `get-ticket-timeline.ts`
  Use when you already know the `conversation-id`.

Then layer on secondary scripts only if needed:

- Historical precedent with full timelines: `search-similar-tickets.ts`
- Shopify facts: `get-shopify-data.ts`
- Pocket account facts: `get-pocket-user-info.ts`
- Reply and optionally close: `reply-and-close-ticket.ts`
- Status change: `change-ticket-status.ts`
- Assignment or unassignment: `assign-ticket.ts`

### Step 2: Resolve the identifiers

Use the most stable identifiers you have:

- `conversation-id` for all mutating actions
- `user-id` or `user-email` for the acting user
- `assignee-id` or `assignee-email` for assignment targets

For actions that should be attributed to a human, provide the acting user whenever possible so audit trails and event metadata remain correct.

### Step 3: Run with project env loaded

Always run scripts through:

```bash
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/<script>.ts <args>
```

Do not run these scripts with plain `tsx`, even if an individual script's local `usage` string still shows that older form. The supported launcher for this skill is:

- `pnpm with-dev-env`
- `node --conditions=react-server --import=tsx/esm`

If you skip the `react-server` conditions, you will hit the `server-only` runtime error.

### Step 4: Interpret the JSON output

All scripts print JSON. Treat the output as the contract:

- summarize the important result back to the user
- preserve ids/slugs/statuses when reporting results
- if needed, feed the JSON into a downstream automation step

## Scripts

### Default Ticket Retrieval Flow

If the user says "get the ticket" and does not specify how, choose the first matching case:

1. If they gave a `conversation-id`, use `get-ticket-timeline.ts`.
2. If they gave a customer email, use `get-customer-latest-ticket.ts`.
3. If they gave a Helper staff email or asked about someone's queue, use `get-open-tickets.ts`.
4. If they gave search text, an order number, a tracking number, or a loose description, use `find-tickets.ts`.
5. Only use `search-similar-tickets.ts` after you already understand the current case and need precedent.

### `get-open-tickets.ts`

Use for assignee-scoped queue lookup.

Required:

- `--user-id <uuid>` or `--user-email <email>`

Optional:

- `--status open,waiting_on_customer,...`
- `--latest`
- `--limit <n>`

Examples:

```bash
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/get-open-tickets.ts --user-email agent@company.com
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/get-open-tickets.ts --user-id <uuid> --latest
```

Notes:

- Default status scope is only `open`
- `--latest` returns only the newest matching ticket
- `--user-email` here means a Helper staff/assignee email, not the customer email on the ticket
- This script is strictly staff-perspective and assignee-scoped
- If the user gives you an email and you are not sure whether it is a staff member or a customer, resolve that first before using this script
- If you want additional queue states, pass them explicitly with `--status open,waiting_on_customer,check_back_later`

### `get-customer-latest-ticket.ts`

Use for customer-perspective lookup when you start from the customer's email and need one current ticket to inspect.

Required:

- `--email <customer-email>`

Optional:

- `--status open,waiting_on_customer,check_back_later,...`

Example:

```bash
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/get-customer-latest-ticket.ts --email customer@example.com
```

Notes:

- Default status scope is `open,waiting_on_customer,check_back_later`
- This is the script to use when the identifier you have is the customer email, not the staff assignee email
- If you need the latest ticket regardless of active/closed state, pass `--status` explicitly
- Typical next step is `get-ticket-timeline.ts` for the returned ticket id if you need the full thread before replying

### `search-similar-tickets.ts`

Use for historical ticket discovery with full-text matching and complete timeline output.

Required:

- `--query "<search text>"`

Optional:

- `--status open,closed,...`
- `--user-id <uuid>` or `--user-email <email>` to scope by assignee
- `--exclude-ticket <id>`
- `--limit <n>`

Example:

```bash
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/search-similar-tickets.ts --query "invoice payment failed"
```

Notes:

- This uses keyword/full-text search, not embedding similarity
- It uses a broader candidate search plus score-based reranking, so it is for precedent-finding rather than initial lookup
- Timeline output comes from `getMessages`, so it includes more than plain messages when present
- Exclude the current ticket with `--exclude-ticket <id>` when you are searching for precedent to draft a reply
- Use a compact issue phrase from the latest customer message, not the full raw email thread, or results may get noisy

### `find-tickets.ts`

Use for the first pass when you need to locate tickets by text or structured identifiers.

Required:

- `--query "<search text>"`

Optional:

- `--status open,closed,...`
- `--user-id <uuid>` or `--user-email <email>` to scope by assignee
- `--exclude-ticket <id>`
- `--limit <n>`
- `--context <n>` where `n` is `0-5`

Examples:

```bash
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/find-tickets.ts --query 'from:rob91bishop@gmail.com'
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/find-tickets.ts --query 'order:#29647'
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/find-tickets.ts --query 'tracking:IW732202207GB'
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/find-tickets.ts --query 'subject:"rough eta" status:open'
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/find-tickets.ts --query 'country:GB carrier:royalmail status:waiting_on_customer'
```

Supported structured operators:

- `from:` or `customer:` for customer email
- `subject:`
- `status:`
- `order:`
- `tracking:`
- `carrier:`
- `country:`
- `id:`
- `slug:`

What it searches:

- conversation ids and slugs
- customer email and customer name
- subject
- message text
- notes
- event reasons / event payload text
- issue group title
- Shopify order and tracking exact matches when the query gives a resolvable order or tracking number

Output contract:

- one result per strong match, not one result per conversation
- every result includes:
  - conversation metadata
  - matched field
  - snippet
  - score
  - exact-match flag
- `--context` adds nearby timeline items for matched messages, notes, or events

Search behavior:

- exact identifiers are tried first: conversation id, slug, customer email, order number, tracking number
- free text is searched across conversation metadata, messages, notes, and events
- if the initial text query returns no hits, the backend retries with broadened variants such as `eta -> delivery estimate / estimated arrival`
- Use `search-similar-tickets.ts` after `find-tickets.ts` only when you need precedent and full timelines, not just raw matches

### `get-ticket-timeline.ts`

Use for the full timeline of the current ticket you are reviewing or replying to.

Required:

- `--conversation-id <id>`

Example:

```bash
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/get-ticket-timeline.ts --conversation-id 123
```

Notes:

- This is the direct script for the current ticket's full history
- Output includes the conversation metadata plus the complete `timeline` from `getMessages`
- Prefer this before drafting a reply if you need to inspect the full thread, including events and notes

### `reply-and-close-ticket.ts`

Use when the user wants to send a staff reply, usually followed by closure.

Required:

- `--conversation-id <id>`
- `--user-id <uuid>` or `--user-email <email>`
- `--message "<text>"` or `--html-body "<html>"`

Optional:

- `--to a@b.com`
- `--cc a@b.com,b@c.com`
- `--bcc a@b.com,b@c.com`
- `--response-to-id <id>`
- `--file-slugs slug1,slug2`
- `--no-close`
- `--no-auto-assign`

Example:

```bash
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/reply-and-close-ticket.ts \
  --conversation-id 123 \
  --user-email agent@company.com \
  --message "Thanks, this has been fixed on our side."
```

Notes:

- Default behavior is reply then close
- Use `--no-close` only when the user explicitly wants the ticket to remain open
- For multiline replies, prefer a shell form that sends real newlines, for example `--message "$(cat reply.txt)"` or ANSI-C quoting like `$'Line 1\n\nLine 2'`
- This script should be preferred over hand-rolling message inserts because `createReply` handles existing Helper side effects

### `get-shopify-data.ts`

Use for Shopify customer or order lookups.

Required:

- `--email <customer-email>` or `--order-name <order-name>`
- `--tracking-number <tracking-number>`

Examples:

```bash
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/get-shopify-data.ts --email customer@example.com
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/get-shopify-data.ts --order-name "#27502"
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/get-shopify-data.ts --tracking-number "IW732202207GB"
```

Notes:

- This wraps the existing Shopify integration helpers already used by the app
- Email lookup returns customer info plus order history
- Order-name lookup returns the specific order plus a minimal customer object
- Output includes `configured`, `customer`, `orders`, and `error`

### `get-pocket-user-info.ts`

Use for Pocket account lookup by email.

Required:

- `--email <user-email>`

Example:

```bash
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/get-pocket-user-info.ts --email customer@example.com
```

Notes:

- This wraps the existing Pocket integration helper already used by the app
- Output includes `configured`, `found`, `user`, and `error`
- Returned user data includes subscription and device information when present

### `change-ticket-status.ts`

Use for direct status transitions.

Required:

- `--conversation-id <id>`
- `--status open|waiting_on_customer|closed|spam|check_back_later|ignored`

Optional:

- `--user-id <uuid>` or `--user-email <email>`
- `--note "<reason>"`

Example:

```bash
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/change-ticket-status.ts \
  --conversation-id 123 \
  --status waiting_on_customer \
  --user-email agent@company.com
```

### `assign-ticket.ts`

Use for assignment and unassignment.

Required for assignment:

- `--conversation-id <id>`
- `--assignee-id <uuid>` or `--assignee-email <email>`

Optional:

- `--user-id <uuid>` or `--user-email <email>`
- `--assigned-to-ai`

Use for unassignment:

- `--conversation-id <id> --unassign`

Example:

```bash
pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/assign-ticket.ts \
  --conversation-id 123 \
  --assignee-email agent@company.com \
  --user-email manager@company.com
```

## Choosing The Right Path

Before running a script, classify the email or identity you were given:

- If it is a Helper staff email, use assignee-oriented flows such as `get-open-tickets.ts`
- If it is the customer who opened the ticket, do not use `get-open-tickets.ts` because that script is not customer-scoped
- If you already have the `conversation-id`, skip lookup scripts and go directly to `get-ticket-timeline.ts`
- Use `find-tickets.ts` for ambiguous or partial identifiers instead of guessing between staff and customer paths

For reply drafting:

- pull the current ticket first using the default retrieval flow above
- pull the current ticket timeline if the reply depends on prior staff actions, status changes, or notes
- fetch Shopify or Pocket data when the issue is about orders, subscriptions, account linkage, or device state
- inspect the latest customer message
- search similar tickets using a short issue phrase from that message
- exclude the current ticket from the similarity search
- draft only after you have both the current thread and precedent

## Guardrails

- Reuse the scripts before writing new ticket-operation code.
- Reuse existing data-layer helpers before adding direct table writes.
- Prefer acting user ids/emails on mutating actions so logs and notifications remain attributable.
- If the request is outside these operations, extend the scripts by composing existing backend helpers rather than bypassing them.
- If the user asks for "similar tickets", remember this skill currently provides deterministic full-text similarity, not semantic embedding similarity.
- If a script run fails with a `server-only` import error, switch to the documented `node --conditions=react-server --import=tsx/esm` invocation rather than debugging the app code.

## Relevant Code

If you need to extend or debug this skill, start here:

- [search.ts](/Users/bharatsoni/helper/lib/data/conversation/search.ts)
- [searchEmailsByKeywords.ts](/Users/bharatsoni/helper/lib/emailSearchService/searchEmailsByKeywords.ts)
- [conversationMessage.ts](/Users/bharatsoni/helper/lib/data/conversationMessage.ts)
- [conversation.ts](/Users/bharatsoni/helper/lib/data/conversation.ts)
- [scripts/\_helpers.ts](/Users/bharatsoni/helper/pocket-helper-skills/scripts/_helpers.ts)
