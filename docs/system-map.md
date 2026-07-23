# System Map

Terse reference for how the pieces connect, post-Phase-1 (async `Store`, PIN removed).
For the critique of this design, see [`critical-review-2026-07.md`](./critical-review-2026-07.md).

## Layers, bottom to top

```
┌──────────────────────────────────────────────────────────────────────┐
│ DATA        ~/.task-man/{tasks.json, config.json, insights-log.json} │
└──────────────────────────────────────────────────────────────────────┘
        ▲ fs + proper-lockfile (lock.ts) + atomic tmp-rename
┌──────────────────────────────────────────────────────────────────────┐
│ PURE CORE   task-filters.ts — applyFilter / resolvePrefix /          │
│             completedOn / createdOn / inProgressUpdatedOn            │
│             (no I/O; shared by every path below)                     │
└──────────────────────────────────────────────────────────────────────┘
        ▲
┌──────────────────────────────────────────────────────────────────────┐
│ STORES      store-interface.ts   Store (fully async) + TaskChanges   │
│             store.ts             TaskStore — sync reads, file-backed │
│             local-store.ts       LocalStore — async wrapper on ^     │
│             remote-store.ts      RemoteStore — HTTP /api/store/*     │
│             get-store.ts         getStore() — picks by config        │
│                                  client.mode + remote_url            │
└──────────────────────────────────────────────────────────────────────┘
        ▲                          ▲
┌───────────────────────┐  ┌───────────────────────────────────────────┐
│ HANDLERS              │  │ SERVER (cli/src/server/)                  │
│ handlers/{tasks,      │  │ routes.ts — Hono app:                     │
│ stats,metrics}.ts     │◀─│  /api/store/*  faithful primitives        │
│ report.ts, insights.ts│  │  /api/tasks…   handler-level convenience  │
│ refine-queue/-questions│ │  /api/{search,stats,metrics,categories}   │
│ (Store-typed, async)  │  │ schemas.ts — zod validation (400s)        │
└───────────────────────┘  │ access-auth.ts — CF JWT → identity (401/3)│
        ▲                  │ scoped-store.ts — per-identity Store view │
        │                  │ static.ts — serves SPA from cli/dist-web  │
        │                  │ index.ts — startServer(), uses LocalStore │
        │                  └───────────────────────────────────────────┘
        │                          ▲ HTTP :3030
┌───────┴───────┬───────────────┬──┴────────────────────────────────────┐
│ TUI (cli/ui)  │ MCP (cli/mcp) │ WEB (web/)                            │
│ getStore() via│ getStore() in │ api.ts → createHttpClient (same-      │
│ useTaskStore; │ tools.ts;     │ origin /api/*); pages: Focus, Capture,│
│ modes call    │ 17 tools wrap │ Backlog, Refine, Metrics; usePoll     │
│ Store async   │ handlers      │ (pauses on hidden); PWA shell + sw.js  │
└───────────────┴───────────────┴───────────────────────────────────────┘
```

## The two API dialects (deliberate)

| Route group | Semantics | Consumer | `created_by` |
|---|---|---|---|
| `/api/store/*` (tasks, add, update, remove, insertAt) | Faithful `Store` primitives — input passed through untouched | `RemoteStore` (TUI/MCP in remote mode) | preserved (so MCP tasks stay `claude`) |
| `/api/tasks`, `/api/tasks/:id/*`, `/api/search`, `/api/stats`, `/api/metrics`, `/api/categories` | Handler-level, validated-ish, server-shaped | Web SPA | forced `human` (the web user is Mario) |

## Auth (current + planned)

- **Local dev**: none. Gate = bind address (default `127.0.0.1`; LAN requires explicit `--bind 0.0.0.0`).
  No auth ⇒ no scoping — the raw store, today's single-user behavior.
- **Production (planned, Phase 2)**: Cloudflare Access in front of a Tunnel; origin has no inbound ports.
  Defense in depth: when `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` are set, `access-auth.ts`
  verifies the `Cf-Access-Jwt-Assertion` JWT (RS256, aud check, 1h-cached JWKS) on every
  `/api/*` request and resolves the caller to a person: `email` claim directly, or
  `common_name` (service token) through the `TASK_MAN_AGENTS` map — unmapped ⇒ 403.
  `/healthz` stays open for container healthchecks.
- **Authorization (landed with the auth layer)**: per-identity namespaces. Each request's
  store is wrapped by `scoped-store.ts` — reads filter to `owner`, writes stamp it, foreign
  ids act like nonexistent ones (404), prefixes resolve within the namespace, undo indices
  are translated scoped↔global. Legacy `owner: null` tasks belong to `TASK_MAN_DEFAULT_OWNER`
  and are adopted (stamped) on first update. `owner` is never client-assignable: `schemas.ts`
  strips it from every request body (zod, unknown keys dropped, enums enforced → 400s).
  Idempotency cache keys include the identity.
  - TUI: `cloudflaredJwtAuth()` — shells to `cloudflared access token`, caches until JWT exp, `forceRefresh` on 401/403.
  - MCP (headless): `serviceTokenAuth()` — `CF-Access-Client-Id/Secret` from `config.json`.
  - `authFromConfig()` picks: service token if configured, else JWT flow.
  - `RemoteStore.req()` retries exactly once each for auth failure (fresh token) and network failure; writes carry `Idempotency-Key` so retries can't duplicate (server keeps an in-memory LRU of 100 keys).

## Key cross-package seams

- npm workspace rooted at the repo (`workspaces: ["cli", "web"]`, one root
  lockfile). `web` depends on `cli` via `"task-man": "*"` + the `exports` map in
  `cli/package.json`; npm symlinks `node_modules/task-man` → `cli`, so `web`
  resolves `task-man/*` against the live `cli/dist`. `cli` must still be built
  before `web` (the symlink points at `dist`); the root `build` script and the
  Dockerfile both encode that ordering.
- Web build output lands directly in `cli/dist-web/` (vite `outDir`), which
  `mountStatic` serves with SPA fallback. No copy step anymore.
- Claude session identity: `sessions.ts` walks process ancestry / `CLAUDE_SESSION_ID`
  → tasks tagged `session_id`, tinted per-session in the TUI.
- Reports: `buildDayReport()` does ONE `store.load()` and derives everything via
  the pure core — deliberately, so remote mode is 1 HTTP call, not ~380.

## Run modes

| Mode | Store | Server | Web |
|---|---|---|---|
| Local (default) | `LocalStore` → file | optional `task-man serve` for LAN web | same-origin :3030 |
| Remote (`client.mode=remote` + `remote_url`) | `RemoteStore` → HTTPS via CF Access | droplet: docker compose (`task-man` + `cloudflared`), no published ports | same hostname, Access-gated |
| Web dev | — | `task-man serve` (:3030) | Vite :5173, proxies `/api` |

## Data files

| File | Written by | Notes |
|---|---|---|
| `tasks.json` | `TaskStore` only (server-side in remote mode) | array of Task; atomic rename; lockfile |
| `config.json` | `task-man config`, login | plaintext — holds Resend key + (remote mode) CF service token |
| `insights-log.json` | `insights.ts` | dedupe/cache of daily insight; always LOCAL, even in remote mode |
