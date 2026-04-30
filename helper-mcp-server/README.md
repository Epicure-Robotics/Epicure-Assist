# Helper MCP Server

Local stdio MCP server for the Helper support app.

It uses Helper's existing data and mutation layer so ticket reads and writes behave like the app, including side effects such as event logs, notifications, notes, and reply queueing.

## Included tools

- `helper_get_current_user`
- `helper_list_team_members`
- `helper_list_tickets`
- `helper_get_ticket`
- `helper_get_shopify_orders`
- `helper_get_shopify_order`
- `helper_get_pocket_user`
- `helper_reply_to_ticket`
- `helper_set_ticket_status`
- `helper_assign_ticket`
- `helper_add_internal_note`

`helper_list_tickets` defaults to active tickets sorted newest-first. It also supports first-class MCP views like `active`, `mine`, `open_unread`, `unassigned_open`, and `awaiting_customer`, plus sort aliases like `latest`, `created_desc`, and `updated_desc`.

The external lookup tools are read-only:

- `helper_get_shopify_orders` fetches Shopify customer and order history by email
- `helper_get_shopify_order` fetches a Shopify order by order number or name, with or without `#`
- `helper_get_pocket_user` fetches Pocket user details and devices by email

## Acting user

The server always acts as a real Helper team member.

Selection order:

1. `HELPER_MCP_USER_ID`
2. `HELPER_MCP_USER_EMAIL`
3. The only active Helper user, if there is exactly one
4. The only active admin user, if there is exactly one

If none of those resolve cleanly, startup fails with an actionable error.

In workspaces with multiple active users, set `HELPER_MCP_USER_EMAIL` or `HELPER_MCP_USER_ID` explicitly.

## Run locally

From the repo root:

```bash
pnpm mcp:helper
```

That command already loads the local Helper env files and runs with `react-server` conditions.

## Run as Streamable HTTP

To expose the MCP server over HTTP instead of stdio:

```bash
HELPER_MCP_USER_EMAIL="support@example.com" \
HELPER_MCP_BEARER_TOKEN="replace-with-a-secret" \
pnpm mcp:helper:http
```

Defaults:

- Host: `127.0.0.1`
- Port: `3334`
- MCP endpoint: `http://127.0.0.1:3334/mcp`
- Health endpoint: `http://127.0.0.1:3334/health`

Optional env vars:

- `HELPER_MCP_HOST`
- `HELPER_MCP_PORT`
- `HELPER_MCP_BEARER_TOKEN`

## Example MCP config

### URL mode for Codex

```bash
codex mcp add helper \
  --url http://127.0.0.1:3334/mcp \
  --bearer-token-env-var HELPER_MCP_BEARER_TOKEN
```

Start the HTTP server first with `pnpm mcp:helper:http`.

### stdio mode

```json
{
  "mcpServers": {
    "helper": {
      "command": "pnpm",
      "args": ["mcp:helper"],
      "cwd": "/Users/bharatsoni/helper",
      "env": {
        "HELPER_MCP_USER_EMAIL": "support@example.com"
      }
    }
  }
}
```

## Notes

- This server uses stdio transport, so it redirects `console.log`/`console.info`/`console.debug` to stderr before loading Helper app modules.
- The HTTP server uses session-based Streamable HTTP, which is a better fit for Codex URL-based MCP registration.
- When `HELPER_MCP_BEARER_TOKEN` is set, HTTP requests must include `Authorization: Bearer <token>`.
- Ticket timelines expose both `html_body` and normalized `body_text` for message reading and draft generation.
- Shopify and Pocket lookup tools return structured `configured`, `found`, and `error` fields so agents can branch cleanly on missing integrations versus no-match lookups.
- All tools accept `response_format` with `markdown` or `json`.
- File uploads are not exposed yet. Reply and note tools currently operate without attachments.
