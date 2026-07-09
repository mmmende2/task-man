# MCP remote-mode hardening

Fixes and features that came out of the 2026-07 remote-migration incident
(`mcp-init-bug.md`): the MCP server silently reported "0 tasks" because it had
bound a local store at boot and a `client.mode` flip never reached it, and
`cloudflared` was resolved by bare name from a GUI-launched PATH.

## Diagnostics: whoami

The diagnostic that incident was missing — three surfaces, one answer:

- **CLI**: `task-man whoami` (add `--json` for machine-readable output).
  Reports mode, remote URL, auth method, reachability, server version, and
  the identity the server resolved for you. Exit code 1 when the remote is
  unreachable.
- **MCP**: the `task_whoami` tool returns the same info. On the hosted
  `/mcp` endpoint it reports `mode: "server"` plus the Access-verified
  identity.
- **Server**: `GET /api/whoami` → `{ identity, version }` (inside the auth
  gate; identity is whatever access-auth verified for this request).

The stdio MCP server also logs its store target to stderr at startup:
`task-man MCP server v0.3.1 running on stdio — store: remote (https://…)` —
visible in Claude Code's MCP logs.

## cloudflared resolution

`cloudflared` is no longer resolved by bare name. Resolution order
(`cli/src/cloudflared.ts`):

1. `client.cloudflared_path` in `~/.task-man/config.json`
2. `$CLOUDFLARED`
3. `/opt/homebrew/bin/cloudflared`, `/usr/local/bin/cloudflared`, `/usr/bin/cloudflared`
4. bare `cloudflared` (PATH)

This makes PATH-prepend workarounds in MCP server definitions (e.g.
`~/.claude.json`) unnecessary — `nvm exec` wrappers are still fine, they're
about node, not cloudflared.

## Mode changes apply without a restart

The MCP server re-reads `~/.task-man/config.json` on every tool call and
rebuilds its store when the `client` section changed
(`createStoreResolver()` in `cli/src/get-store.ts`). Flipping `client.mode`
takes effect on the next tool call. The store instance (and its cached
cloudflared token) is reused while config is unchanged.

## Service tokens for headless MCP

The most robust auth for a headless MCP client — no cloudflared, no browser,
non-expiring:

1. Cloudflare Zero Trust → Access → Service Tokens → create one; note the
   Client ID and Client Secret.
2. Add an Access policy on the application that allows the service token.
3. Map the token to your identity on the server: `TASK_MAN_AGENTS`
   (`deploy/.env.example`) — `<token common_name>=<your email>`. An unmapped
   token authenticates at the edge but gets 403 at the origin.
4. Client side:
   `task-man config client.service_token_id <id>` and
   `task-man config client.service_token_secret <secret>`.
   When both are set they take precedence over the cloudflared JWT flow.

## Remote MCP endpoint (`/mcp`) — claude.ai connector / iOS

The server exposes the same MCP tools over streamable HTTP at `POST /mcp`
(`cli/src/server/mcp-route.ts`). Stateless: no sessions to strand on deploy;
identity is re-derived from the Access JWT per request and every tool is
scoped to that identity's tasks. `task_session_color` is stdio-only (there is
no local Claude Code session to color on a hosted endpoint).

Setup (one-time):

1. **Cloudflare dashboard**: Zero Trust → Access → Applications → the
   `tasks.task-man.org` app → Advanced settings → enable **Managed OAuth**.
   In the dynamic client registration settings, allow the redirect URI
   `https://claude.ai/api/mcp/auth_callback`. Access then runs the whole
   OAuth flow with Claude at the edge and keeps forwarding the usual
   `Cf-Access-Jwt-Assertion` to the origin — no OAuth code server-side.
2. **Deploy** a server version that has `/mcp` (see
   `docs/release-deploy-quickstart.md`).
3. **claude.ai (web)** → Settings → Connectors → Add custom connector →
   URL `https://tasks.task-man.org/mcp` → complete the Access login. The
   connector then appears in the Claude iOS/Android apps automatically
   (connectors can only be *added* on the web).

Local smoke test (no auth in local dev):

```sh
task-man serve &
curl -s -X POST http://localhost:3030/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

or point `npx @modelcontextprotocol/inspector` at `http://localhost:3030/mcp`.
