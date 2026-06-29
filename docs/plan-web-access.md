# Plan — Web access for task-man (v1)

## Context

Task-man today is a TUI-only app: Ink/React rendering, JSON store at `~/.task-man/tasks.json`, file-locked writes shared with the MCP server. It works beautifully at the desk and lousy everywhere else — phone capture from the couch, mid-meeting checks on a personal laptop, "what was I working on?" while making coffee all require physically returning to the terminal.

The PRD already names this gap (`PRD.md` line 34, "Mario (mobile/web)" user) and reserves Phase 4 for it. The LAN sync plan (`docs/plan-lan-sync.md`) anticipates a phone web view as a cheap follow-up to the sync HTTP layer.

This plan ships that web access **before** LAN sync, scoped tight: a local HTTP server alongside the TUI, a mobile-first React frontend with Focus view + Quick Capture, 4-digit PIN auth, LAN reachability only. Cross-network access (Tailscale, public tunnels) and laptop-to-laptop sync are deferred.

## Decisions (locked with user)

- **Web first, LAN sync later.** v1 only sees the store on whichever laptop is running the server. The user accepts this trade for a faster useful demo.
- **LAN-only.** Server binds to `0.0.0.0` on the local network. Phone reaches it via `http://<host>.local:<port>` using mDNS/Bonjour. Cross-network is a v2 concern.
- **Scope: Quick Capture + Focus view.** Smallest surface that's useful from the couch. Plan / Refine / Metrics deferred.
- **Auth: 4-digit PIN.** Simple passkey set in `config.json`, entered once per device, persisted in a signed cookie. Not "real" auth, but enough that a roommate or guest on the wifi can't dump your tasks.

## Goals & non-goals (v1)

**Goals.**
- View focused tasks and active subtasks from any device on the LAN.
- Capture new tasks from phone with category / priority / scope flags (mirroring TUI Write quick-entry).
- Mark tasks done / in-progress from the web.
- Outrun aesthetic preserved; mobile-responsive (44pt touch targets, sticky header, readable in sunlight via a high-contrast toggle).
- TUI continues to work unchanged; mutations from web propagate via the existing 2s poll.

**Non-goals.**
- Cross-network access (Tailscale / Cloudflare Tunnel) — v2.
- LAN sync between laptops — separate plan, lands after.
- Plan / Refine / Metrics modes on web — v2+.
- SSE / WebSocket push — polling is fine for v1.
- SQLite migration — JSON stays.
- Multi-user / collaboration.

## Architecture

### Layer cake

```
+-------------------------------------------------+
| Web frontend (React + Vite, web/)               |
|   - Focus view, Quick Capture, PIN entry        |
+--------------------------+----------------------+
                           |  fetch + cookies
                           v
+-------------------------------------------------+
| HTTP server (cli/src/server/)                   |
|   - REST routes  - PIN auth  - static frontend  |
+--------------------------+----------------------+
                           |
                           v
+-------------------------------------------------+
| Shared handlers (cli/src/handlers/)  [NEW]      |
|   - createTask, updateTask, completeTask, ...   |
+--------------------------+----------------------+
                           |
                           v
+-------------------------------------------------+
| TaskStore (cli/src/store.ts) — JSON + file lock |
+-------------------------------------------------+
                           ^
                           |  (also called by)
+-------------------------------------------------+
| TUI (cli/src/ui/) | MCP tools (mcp/src/tools.ts)|
+-------------------------------------------------+
```

### Phase 0 — Handler extraction (refactor, prerequisite)

`mcp/src/tools.ts` currently embeds the call-into-store logic inside each `registerTool` block. Lift these into plain async functions in a new `cli/src/handlers/` directory, exported via a new `task-man/handlers` package export. MCP tools become thin adapters that call the same functions; the new REST routes call them too. Zero behavior change *for MCP*, but eliminates duplicate logic before it has a chance to drift. (Only the handlers below move; the remaining MCP tools — `task_subtasks`, `task_categories`, `task_refine_queue`, `task_prioritize`, `task_end_day`, `task_session_color` — stay as-is for v1, since the web doesn't call them.)

Functions to extract: `createTask`, `updateTask`, `deleteTask`, `completeTask`, `startTask`, `focusTask`, `unfocusTask`, `listTasks`, `getTask`, `searchTasks`, `getStats`. Each takes a typed input and returns a typed result. No HTTP, no MCP, no UI concerns.

**Decision — the top-level-completion guard stays in the MCP adapter, NOT in the shared handler.** MCP `task_complete` / `task_update` refuse to mark a top-level (parent) task done — *"Only the user completes parent tasks"* (`mcp/src/tools.ts:207`, `:285`). That guard is Claude-specific: on the web, the user **is** Mario, and "Mark done" on a focused parent is the headline action (see Focus view spec). So the shared `completeTask` / `updateTask` handlers carry **no** such guard; the MCP tool bodies keep their own guard check before delegating. "Zero behavior change for MCP" means MCP still refuses; the web does not. An implementer must not lift this guard into the shared handler.

### Phase 1 — HTTP server + REST API + PIN auth

**Module:** `cli/src/server/` (new)
- `index.ts` — server bootstrap; reads port + bind from config / flags.
- `routes.ts` — REST endpoints (table below).
- `auth.ts` — PIN check, signed-cookie issuance, middleware.
- `static.ts` — serves the built web frontend from `cli/dist-web/` (the deploy target the build script copies to — see Phase 2; *not* `web/dist/`, which is only the in-tree Vite output), or proxies the Vite dev server when `--dev`.

**Framework:** Hono (small, modern, runs on Node + Bun, native TS). Alternative: Express — fine but heavier. Hono recommended.

**REST surface (mirrors handler functions):**

| Method | Path                          | Handler          |
|--------|-------------------------------|------------------|
| POST   | `/api/auth/login`             | check PIN, issue cookie |
| POST   | `/api/auth/logout`            | clear cookie     |
| GET    | `/api/tasks`                  | listTasks (filters via query string) |
| GET    | `/api/tasks/:id`              | getTask          |
| POST   | `/api/tasks`                  | createTask (Idempotency-Key header) |
| PATCH  | `/api/tasks/:id`              | updateTask       |
| DELETE | `/api/tasks/:id`              | deleteTask       |
| POST   | `/api/tasks/:id/complete`     | completeTask     |
| POST   | `/api/tasks/:id/focus`        | focusTask        |
| POST   | `/api/tasks/:id/unfocus`      | unfocusTask      |
| GET    | `/healthz`                    | liveness ping    |
| GET    | `/*`                          | static frontend  |

All `/api/*` routes except `/api/auth/login` and `/healthz` require a valid session cookie; otherwise 401.

**Idempotency.** Mutating endpoints honor an `Idempotency-Key` header (client-generated UUID). Server keeps an in-memory LRU of the last 100 keys → response. Phone double-taps and flaky cellular don't create duplicates.

**Auth flow.**
1. User sets the PIN with a **dedicated** `task-man serve --set-pin` (prompts, validates 4 digits, stores) — *not* the generic `task-man config server.pin 1234`. The generic `setConfigValue` coerces numeric strings to numbers (`cli/src/config.ts:57`), so `1234` would land as the integer `1234` and a PIN like `0042` would be mangled to `42`. The dedicated path keeps the PIN a string.
2. Phone visits `http://laptop.local:3030`, gets PIN entry screen.
3. POST `/api/auth/login` with PIN → server signs HMAC cookie (`task-man-session`) with a secret stored in `~/.task-man/config.json` (`server.session_secret`, auto-generated on first start).
4. Cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, 30-day expiry. Persists across browser restarts.
5. Subsequent requests carry the cookie automatically.

**Config additions** (`cli/src/types.ts` `TaskManConfig`):
```ts
server?: {
  port?: number;          // default 3030
  bind?: string;          // default "0.0.0.0"; "127.0.0.1" forces local-only
  pin?: string;           // 4-digit, stored as a string (see note below)
  session_secret?: string;// auto-generated on first start
}
```

**PIN storage — decision: plaintext string, no bcrypt/argon2.** The config file lives at `~/.task-man/config.json` (user-only). Hashing a 4-digit PIN buys almost nothing — the 10k keyspace is trivially brute-forced offline if the file leaks, and the file already holds `session_secret` and the Resend API key in the clear. The *real* control is the login rate-limit (5 attempts / 5 min / IP, below). Store the PIN as a string (preserving leading zeros); compare in constant time. Revisit hashing only if the threat model grows past "roommate on the wifi."

**CLI command** (`cli/src/commands/serve.ts`, new):
- `task-man serve` — start the server, log the LAN URL, hold the foreground.
- `task-man serve --port 3030 --bind 127.0.0.1` — overrides.
- `task-man serve --daemon` — fork and write pidfile to `~/.task-man/server.pid`. (Optional in v1; can defer to v2.)

The server is **explicit**, not auto-started by the TUI. Closing the TUI shouldn't kill the phone's reach. Daemonization / launchd integration is a v2 polish.

### Phase 2 — Web frontend (Focus + Quick Capture)

**Layout:** `web/` at the repo root. Standalone Vite + React + TypeScript project. Build output deploys to `cli/dist-web/` so the published `task-man` package can serve it without a separate install. (Build script in cli's `package.json`: `"build": "tsc && cd ../web && npm run build && cp -r dist ../cli/dist-web"`.)

**Routes (client-side):**
- `/login` — PIN keypad. 4 large buttons in a 3×4 grid plus delete + submit. Auto-submits on 4th digit.
- `/` — Focus view. Default landing.
- `/capture` — Quick Capture (slide-up sheet from `/`).

**Focus view spec.**
- Single-column list of focused tasks, ordered priority desc then `updated_at` desc. Note this composite sort is **not** in the shared `sortTasks` (`mcp/src/tools.ts:41` sorts on one key at a time); it lives in the TUI's FocusMode. Either extract that comparator alongside the Phase 0 handlers (preferred, so the two surfaces can't drift) or reimplement it in `listTasks` and pin the tiebreaker explicitly.
- Each row: priority dot · title · category chips on the right · subtask progress bar if any.
- Tap a row → expands inline: description, subtasks with checkboxes, "Mark done" / "Unfocus" buttons.
- Sticky bottom bar: `[+ Capture]` button (large), scope filter chip (`all` / `personal` / `professional`).
- Polling: `GET /api/tasks?focused=true` every 2s while the tab is foregrounded; pause when backgrounded (use `document.visibilitychange`).

**Quick Capture spec.**
- Single text input, auto-focused.
- Mirrors TUI Write syntax: `clean dishes -c housework -p high -s personal`. The parser is `parseWriteInput`, currently a **private, non-exported** function in `cli/src/ui/modes/WriteMode.tsx:56` (NOT in `cli/src/commands/add.ts` — that file uses Commander `.option()` on argv and cannot parse a freeform string). Lift `parseWriteInput` (and its `PRIORITY_MAP` / `SCOPE_MAP` at `WriteMode.tsx:44`) into a shared module — e.g. `cli/src/parse-entry.ts`, exported via `task-man/parse-entry` — and have both `WriteMode` and the web import it, so behavior matches exactly. Note the real syntax is richer than the example: priority aliases (`l/m/h/u/urgent/med`), scope aliases (`per/pro`), repeatable + quoted `-c`, a `-d` description, `-f` focused, and a bare `title - category` shorthand. **Default priority is `medium`** (`WriteMode.tsx:59`) — match that, not `add.ts`'s `high` default.
- Below input: live preview chip showing parsed category / priority / scope.
- Submit on Enter or tap of the big magenta `Capture` button.
- After submit: input clears, last-captured title fades into a small `Captured: <title>` toast at the top.

**Aesthetic.**
- Outrun palette from the TUI. Caveat: only `SESSION_COLORS` in `cli/src/constants.ts:25` are hex; `PRIORITY_COLORS` / `STATUS_COLORS` are ANSI color *names* (`'magenta'`, `'cyan'`, `'gray'`, …), not hex. So there is no single hex source of truth to "extract" — define the web's hex palette explicitly (a `web/src/theme.css`), reusing `SESSION_COLORS` for session tints and choosing hex equivalents for magenta/cyan that match the terminal rendering you're targeting.
- Magenta on dark background; cyan accents for focused state.
- High-contrast toggle in a top-right gear menu (defaults to on for system `prefers-contrast: more`).
- No emojis, matching the PRD aesthetic call.
- 44pt minimum tap targets; system font stack with monospace for task titles.

**PWA basics.**
- `manifest.json` with name, icons (generate from a quick logo), theme color.
- Minimal service worker that caches the app shell (static JS/CSS/HTML) so the page loads even on flaky cellular. **Do NOT cache `/api/*`** — task data must always be fresh.
- "Add to Home Screen" works on iOS / Android.

### Phase 3 — Polish

- TUI footer indicator: if `~/.task-man/server.pid` exists and the process is alive, show `web :3030` in `cli/src/ui/shared/Footer.tsx`. Read-only check, no coupling.
- README: section on setting up the PIN, finding the LAN URL, adding to home screen.
- Error states: "Server unreachable" overlay with a retry button if polling fails 3× in a row.

## Critical files

**New:**
- `cli/src/handlers/index.ts` — re-export the extracted handler functions.
- `cli/src/handlers/{tasks,auth,stats}.ts` — extracted from `mcp/src/tools.ts`.
- `cli/src/server/index.ts` — server bootstrap.
- `cli/src/server/routes.ts` — REST routes.
- `cli/src/server/auth.ts` — PIN + cookie middleware.
- `cli/src/commands/serve.ts` — `task-man serve` command.
- `web/` — Vite + React project (own `package.json`, `vite.config.ts`, `src/`).
- `cli/src/__tests__/server.test.ts` — supertest-style integration coverage.
- `cli/src/__tests__/handlers.test.ts` — pure-function tests for each extracted handler.

**Touch:**
- `cli/src/index.ts` — register the `serve` command with Commander.
- `cli/src/types.ts` — add `server` block to `TaskManConfig`.
- `cli/src/config.ts` — defaults for the new fields.
- `cli/src/constants.ts` — `SESSION_COLORS` (hex) can be imported by the web; the rest of the palette is ANSI names, so the web defines its own hex equivalents (see Aesthetic).
- `cli/package.json` — add Hono and a cookie-signing dep (`hono/jwt` or `cookie-signature`); no bcrypt (see PIN storage decision). Update `exports` to expose `task-man/handlers` and `task-man/parse-entry`; build step that copies `web/dist` → `cli/dist-web` (the serve root).
- `mcp/src/tools.ts` — refactor each tool body to call the new shared handlers. **No behavior change.**
- `cli/src/ui/shared/Footer.tsx` — server-running indicator (Phase 3).

**Reuse (don't reimplement):**
- `TaskStore` (`cli/src/store.ts`) — already file-locked and atomic; web mutations go through it like everything else.
- Quick-entry flag parser: `parseWriteInput` at `cli/src/ui/modes/WriteMode.tsx:56` (NOT `task-man add`, which uses Commander on argv). Extract to a shared module — see Quick Capture spec.
- Insights / report modules if Metrics ever lands on web (out of v1 scope).
- `cli/src/sessions.ts` for session-color tinting (paint Claude-authored task rows on web with the same per-session color the TUI uses).

## Verification

**Unit / integration (automated).**
- `cli/src/__tests__/handlers.test.ts`: each handler against a temp `TaskStore`. Covers create / update / complete / focus / list / search.
- `cli/src/__tests__/server.test.ts` (supertest): unauth request → 401; valid PIN → cookie; subsequent request with cookie → 200; bad PIN → 401 with rate-limit (5 attempts / 5 min); idempotency key replay returns the same response without re-creating the task.
- Web component tests: PIN keypad submit, Quick Capture flag parsing preview, Focus row tap-to-expand. (Vitest + React Testing Library.)

**Manual end-to-end.**
1. `task-man config server.pin 4242` on the laptop.
2. `task-man serve` — confirm log line `serving on http://laptop.local:3030`.
3. From phone on the same wifi: open URL, enter PIN, see Focus list match the TUI.
4. Mark a task done from phone → within 2s the TUI's Focus mode reflects it (the polling already does this).
5. Open Quick Capture on phone, type `test capture from phone -c web -p high`, submit → task appears in TUI Plan mode under `web` category with high priority.
6. Lock phone, walk into another room (still on wifi), unlock — page is still authenticated (cookie persisted).
7. Toggle airplane mode on phone for 30 seconds, come back → app shell loads from service worker, shows "reconnecting" state, reconnects on its own.
8. Open the URL from a guest device that doesn't have the cookie → PIN screen.

**Sanity checks.**
- TUI mutations during a sync window don't conflict with web mutations: file locking is the contract; no special handling needed, but verify by hammering with concurrent `task-man add` and web POSTs.
- Confirm `mcp/src/tools.ts` still produces identical responses after the handler refactor (run the existing MCP test suite, or hit each tool through Claude and compare).

## Open risks (acknowledged, not blocking)

- **TUI mid-edit collision.** If the TUI is in insert mode editing a task title and the web completes the same task, the next 2s poll will replace the underlying task. The TUI's edit buffer survives but writes to a stale state on commit. Likely benign for a single user, but documenting as known. Real fix is a future "edit lock" or row-version check on PATCH.
- **mDNS / `.local` resolution** is solid on iOS, Android, and macOS but flaky on some Windows + corporate-managed networks. If the user's phone can't resolve `laptop.local`, fall back to the laptop's LAN IP (server logs both at startup).
- **PIN brute-force on the LAN.** 4 digits = 10k space. Rate-limit at 5 attempts per 5 minutes per IP, with exponential backoff after that. Document that this is not real auth and a determined LAN attacker is out of the threat model.
- **Sequencing with LAN sync.** Once LAN sync lands, the merge engine's "abort if peer would delete >50%" guard becomes load-bearing because a third surface (web/phone) is mutating data. Flag this in the LAN sync plan when it's resumed.

## What v2 looks like (out of scope, for context)

- Tailscale-bound interface for cross-network access (work ↔ home).
- LAN sync between laptops (existing plan).
- Plan / Refine / Metrics modes on web.
- SSE event stream backed by `fs.watch` on the JSON file.
- Daemonization + launchd plist for "always-on" web access without an open terminal.
