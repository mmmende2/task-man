# Plan: Host task-man on DigitalOcean behind Cloudflare, with a remote-capable TUI

## Context

`task-man` is currently a local-only personal tool: the Ink TUI and MCP both read/write `~/.task-man/tasks.json` via the in-process `TaskStore`. A Hono server (`task-man serve`) exists but is only used by the bundled web UI for LAN/mobile access, protected by a 4-digit PIN.

Goal: deploy the server to DigitalOcean so the web/mobile UI is reachable from anywhere; gate it with Cloudflare (DNS + CDN + Access); and refactor the TUI/MCP so they talk to that hosted server as their default backend. This makes the hosted server the single source of truth across clients.

Confirmed decisions:
- **Sync model**: TUI/MCP go fully remote by default. A local-file mode is retained as a config toggle for dev/offline use — no sync logic between the two.
- **TUI auth**: `cloudflared access login` flow (JWT-based, tied to user identity).
- **PIN auth**: dropped. Cloudflare Access is the only gate in production. Local dev binds to `127.0.0.1` and runs unauthenticated.
- **Edge routing**: Cloudflare Tunnel (no inbound ports on the droplet, no Caddy/Let's Encrypt to manage).
- **Storage on server**: stay on JSON files for now. SQLite migration is a possible follow-up; not in scope here.

## Architecture after change

```
                                ┌───────────────────────────────┐
  Browser / mobile  ────HTTPS──▶│                               │
                                │   Cloudflare edge             │
  TUI (laptop)      ──cf-jwt──▶│   • DNS + CDN                 │
  MCP  (laptop)     ──cf-jwt──▶│   • Access policy             │──┐
                                │   • Tunnel terminator         │  │
                                └───────────────────────────────┘  │
                                                                   │ outbound only
                                                                   ▼
                       ┌────────────────────────────────────────────────┐
                       │  DigitalOcean Droplet (Ubuntu, $6)             │
                       │  docker compose:                               │
                       │   • cloudflared      (tunnel client)           │
                       │   • task-man         (task-man serve, :3030)   │
                       │  volume: /var/lib/task-man  →  ~/.task-man     │
                       │  cron:   nightly tar → DO Spaces               │
                       └────────────────────────────────────────────────┘
```

Single source of truth: the droplet's volume. All three clients (TUI, MCP, web) hit the same Hono API through the Cloudflare edge.

---

## Phase 1 — Server-side code changes

### 1a. Remove PIN auth from the server

PIN auth becomes dead weight: in production CF Access is the gate; in local dev binding to `127.0.0.1` is enough.

Touch:
- `cli/src/server/auth.ts` — delete or keep only a no-op session helper used by tests during transition.
- `cli/src/server/routes.ts` lines 73–109 — remove the auth middleware, `/api/auth/login`, `/api/auth/logout`, `/api/auth/session` (or convert `/session` to return identity-from-JWT if present, useful for the web UI to show "signed in as X").
- `cli/src/commands/serve.ts` — remove `--set-pin`, remove the "No web PIN set" warning. Add `--bind 127.0.0.1` as the recommended local dev option in `--help`.
- `cli/src/types.ts` lines 64–69 (`server.pin`, `server.session_secret`) — remove from `Config`.
- `cli/src/__tests__/server.test.ts` — drop auth tests, drop `pin`/`sessionSecret` from `createApp` calls.
- `web/src/api.ts` lines 46–57 — drop `login`/`logout`/`session` (or stub `session` to always-true).
- `web/src/` login screen component (find via `grep -r "api.login" web/src`) — remove and route directly to the main view.

### 1b. Surface every TaskStore op via HTTP

Audit `cli/src/server/routes.ts` against `cli/src/store.ts` public methods (`add`, `update`, `query`, `getCompletedOn`, `getCreatedOn`, `getInProgressUpdatedOn`, `remove`, `insertAt`, `resolveId`) and add routes for anything missing. Same input/output shapes as the existing handlers (`cli/src/handlers/`) so server and direct-store paths stay symmetrical.

### 1c. Define a `Store` interface and a `RemoteStore` implementation

Create `cli/src/store-interface.ts`:
- Extract the public surface of `TaskStore` into a `Store` interface (`add`, `update`, `query`, `remove`, `resolveId`, etc.).
- Make `TaskStore` (`cli/src/store.ts`) implement it explicitly.

Create `cli/src/remote-store.ts`:
- New `RemoteStore` class implementing `Store`. Each method delegates to an HTTP call against the configured server.
- Reuse the existing fetch wrapping pattern from `web/src/api.ts` (the `unwrap`, `ApiError`, idempotency-key helpers). Extract those helpers into `cli/src/api-client.ts` and import from both `web/` and `cli/`.
- Auth: on each request, obtain a Cloudflare Access JWT by shelling to `cloudflared access token --app=<server-url>` (lazily cached for the token's lifetime); attach as `cf-access-token` header. If `cloudflared` isn't installed or token retrieval fails, surface a clear "run `task-man login`" error.

### 1d. Config additions

In `cli/src/config.ts` / `cli/src/types.ts`:
- Add `Config.client = { mode: 'local' | 'remote'; remote_url?: string }` with `mode: 'remote'` as the default once `remote_url` is set.
- Add CLI commands:
  - `task-man config client.remote_url https://tasks.yourdomain.com`
  - `task-man config client.mode local|remote`
  - `task-man login` — thin wrapper around `cloudflared access login <remote_url>`, with a friendly "install cloudflared" message if it's missing.

### 1e. Store factory used by TUI + MCP

Create `cli/src/get-store.ts`:
```
export function getStore(): Store {
  const cfg = loadConfig();
  if (cfg.client?.mode === 'remote' && cfg.client.remote_url) {
    return new RemoteStore(cfg.client.remote_url);
  }
  return new TaskStore();
}
```

Wire it in:
- `cli/src/ui/hooks/useTaskStore.ts:2` — replace `new TaskStore()` with `getStore()`.
- `mcp/src/tools.ts:56` — same swap.
- `cli/src/ui/hooks/useServerStatus.ts` — in remote mode, replace the pidfile probe with a `GET /api/health` ping against the configured `remote_url`.

---

## Phase 2 — Infrastructure setup

### 2a. Droplet
- DO Basic Droplet, $6/mo, Ubuntu 24.04, region closest to user.
- SSH key only, root login disabled, ufw deny inbound except SSH. **No port 80/443 needed** — Tunnel is outbound-only.
- Install Docker + `docker compose` plugin.

### 2b. Compose stack on the droplet

`/opt/task-man/docker-compose.yml`:
- `task-man` service: image built from `cli/Dockerfile` with a `TASK_MAN_VERSION` build arg (e.g. `RUN npm i -g task-man@${TASK_MAN_VERSION}`) — pin to the exact published version, never `@latest`, so a droplet rebuild can't silently pull an untested release. `CMD ["task-man","serve","--bind","0.0.0.0","--port","3030"]`. Mount `/var/lib/task-man` → `/root/.task-man`. Internal network only — no published ports. `restart: unless-stopped`.
- `cloudflared` service: official `cloudflare/cloudflared:latest`, `command: tunnel run`, `TUNNEL_TOKEN` from `.env`. Joined to the same internal network so it can reach `task-man:3030`. `restart: unless-stopped`.

`/opt/task-man/.env`:
- `TUNNEL_TOKEN=...` (issued by Cloudflare when the tunnel is created).
- `RESEND_API_KEY=...` for the existing email feature (currently stored in config; bring it into env if a flag is added, otherwise set via `task-man config email.resendApiKey` after first start).

### 2c. Cloudflare setup
1. Move the chosen domain to Cloudflare (update registrar nameservers).
2. Zero Trust dashboard → create a Tunnel; copy the token into `.env`.
3. Add a public hostname on the tunnel: `tasks.yourdomain.com` → `http://task-man:3030`.
4. Zero Trust → Access → Applications → Self-hosted → cover `tasks.yourdomain.com` with policy "Emails include `mariomendezmusic@gmail.com`". Session duration ≥ 24h to reduce reauth friction for the TUI.
5. Leave the orange cloud / proxy on (CDN + DDoS).

### 2d. Backups
- Create a DO Space, generate access keys.
- Cron on the droplet: `0 4 * * *  tar -czf - /var/lib/task-man | rclone rcat spaces:task-man-backups/$(date -I).tar.gz` (rclone config installed once).
- Retention: keep 30 days via a second weekly cron that lists + deletes.
- Optional: also enable DO's weekly droplet snapshots ($1.20/mo).

---

## Phase 3 — Wire up clients, verify end-to-end

### 3a. Local prep (on Mario's laptop)
1. `brew install cloudflared`.
2. `task-man config client.remote_url https://tasks.yourdomain.com`.
3. `task-man login` → browser opens, authenticate, JWT cached at `~/.cloudflared/`.
4. `task-man config client.mode remote`.

### 3b. Verification checklist
- **Web UI**: visit `https://tasks.yourdomain.com` → CF Access login → main app loads, tasks render. Create / edit / complete a task in the browser.
- **TUI remote**: launch TUI; tasks created in the browser appear; create a task in the TUI; refresh browser to confirm it appears there.
- **TUI local fallback**: `task-man config client.mode local` → TUI now operates on local file. Switch back to `remote` and confirm round-trip still works.
- **MCP**: from a Claude Code session, use `task-man__task_add` → confirm in both TUI and browser.
- **Auth gate**: `curl -i https://tasks.yourdomain.com/api/tasks` (no JWT) → expect Cloudflare Access HTML challenge, not a 200.
- **JWT path**: `curl -i -H "cf-access-token: $(cloudflared access token --app=https://tasks.yourdomain.com)" https://tasks.yourdomain.com/api/tasks` → expect 200 + JSON.
- **Restart resilience**: `docker compose restart task-man` → data still present; TUI reconnects without intervention.
- **Backup**: trigger the backup cron manually; confirm tarball lands in the DO Space and restores into a clean `/var/lib/task-man` cleanly.
- **Server tests**: `npm test --prefix cli` passes after auth removal and added routes.

### 3c. Cutover
- Tag the pre-change commit (`pre-remote-v1`) for easy rollback.
- Publish a `task-man@0.2.0` to npm with the remote-capable client (kept backward compatible: no config = local mode).
- One-time data seed: `scp ~/.task-man/tasks.json root@droplet:/var/lib/task-man/tasks.json` so the hosted server starts with the laptop's current state.

---

## Out of scope / follow-ups
- **Droplet update/deploy workflow.** This plan covers the initial image build and cutover (3c) but not how later `task-man` releases get onto the droplet. Needs: a defined process (e.g. bump `TASK_MAN_VERSION` build arg → `docker compose build && up -d` over SSH, or a small script/CI job that does it) plus a rollback step if a new version misbehaves in production.
- Replacing JSON with SQLite on the server (worth doing once concurrent client traffic > occasional).
- Per-device identity in MCP/TUI (CF JWT identifies the user; tagging tasks with `created_by` per device would need a separate scheme).
- Multi-user / sharing — the Access policy is single-email today; expanding requires policy + per-user scoping in the data.
- Coolify or a second product on the same droplet — Tunnel makes adding another service one extra hostname + container; no architectural change.
