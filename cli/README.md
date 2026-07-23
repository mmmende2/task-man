# task-man (CLI)

The one published package: an Ink-based interactive TUI, a bundled Hono server that powers the [web SPA](../web/README.md), and the [MCP server](../mcp/README.md) as a second bin (`task-man-mcp`, source in `src/mcp/`).

Also re-exports the `TaskStore` and related modules used by `web/` at build time via the package entries in [`package.json`](./package.json).

## Install

### Prerequisites

- Node.js >= 18
- npm

### From source

This repo is an npm workspace, so install once from the root:

```bash
npm install                  # from the repo root — sets up cli + web
npm run build -w task-man    # build the CLI (add web with `npm run build` at root)
cd cli && npm link           # exposes `task-man` globally
```

Verify:

```bash
task-man --version
```

### If you use nvm

`npm link` installs into the active Node version. If you switch versions, the binary won't be on your PATH.

**Option A** — Link under your default version:

```bash
nvm use default
cd cli && npm link
```

**Option B** — Pin the link target on your PATH:

```bash
npm -g root        # e.g. /Users/you/.nvm/versions/node/v22.0.0/lib/node_modules
# Add the matching bin dir to ~/.zshrc:
export PATH="/Users/you/.nvm/versions/node/v22.0.0/bin:$PATH"
```

### After rebuilding

Code changes only take effect after `npm run build`:

```bash
cd cli && npm run build           # CLI only
cd cli && npm run build:all       # CLI + web (regenerates dist-web/)
```

## Quick start

```bash
task-man add "Set up CI pipeline" -p high -s professional
task-man add "Configure GitHub Actions" --parent <id>
task-man focus <id>
task-man done <id>
task-man                          # launch interactive TUI
```

## Interactive TUI

Running `task-man` with no arguments opens the TUI. Five modes:

| Key | Mode | Purpose |
|-----|------|---------|
| `f` | Focus | Work through your focused tasks |
| `t` | Plan (triage) | Organize focused + backlog lists |
| `w` | Write | Quick-add tasks from a prompt |
| `m` | Metrics | View stats and generate end-of-day reports |
| `r` | Refine | Rapid-fire triage of tasks missing metadata |

`~` cycles the scope filter: all / personal / professional. The active scope always
shows in the header (dim `all` when unfiltered), and rows carry a dim `·per`/`·pro`
tag while viewing all scopes. `q` quits.

### Vim keybindings

**Navigation**

| Key | Action |
|-----|--------|
| `j` / `k` | Move down / up |
| `Tab` | Toggle between task and subtask navigation (focus mode) |

**Editing**

| Key | Action |
|-----|--------|
| `i` | Edit title (cursor at start) |
| `A` | Edit title (cursor at end) |
| `cc` | Clear title and edit from scratch (write review only) |
| `o` | Create new task below |
| `O` | Create new task above |
| `Esc` / `Enter` | Save edit |

**Actions**

| Key | Action |
|-----|--------|
| `x` | Toggle done / todo |
| `S` | Toggle scope personal / professional (focus, plan, write review) |
| `Space` | Toggle focused / backlog (plan + write review) |
| `dd` | Cut task (enter holding mode) |
| `p` | Paste below (in holding mode) |
| `P` | Paste above (in holding mode) |
| `u` | Undo last action |
| `/` | Search / filter tasks |

`dd`/`p` reordering is only available in plan mode. Cut, navigate, paste.

## CLI reference

> **Retired (2026-07):** the task-facing subcommands (`add`, `list`, `done`,
> `start`, `focus`, `unfocus`, `session-refocus`, `end-day`) were removed —
> humans work in the TUI/web, Claude works through MCP (`task_end_day` covers
> reports and email), and those commands only ever touched the local file
> (they never followed `client.mode = remote`). What remains is operational.

### `task-man config <key> [value]`

Get or set configuration values. Uses dot notation.

```bash
task-man config focus.maxFocused        # read
task-man config focus.maxFocused 5      # write
task-man config email.to me@example.com
```

| Key | Description | Default |
|-----|-------------|---------|
| `focus.maxFocused` | Max tasks in focus list (guardrail) | `3` |
| `email.to` | Email address for end-of-day reports | — |
| `email.resendApiKey` | Resend API key for email delivery | — |
| `email.autoPromptAfter` | Time to prompt for end-of-day | `17:00` |
| `client.mode` | `local` (file) or `remote` (hosted server) | `local` |
| `client.remote_url` | Base URL of the hosted server | — |
| `client.service_token_id` / `client.service_token_secret` | CF Access service token for headless clients (MCP) | — |

Config lives at `~/.task-man/config.json`.

### `task-man watch`

Live-updating display of focused tasks. Useful as a sidebar.

| Flag | Description | Default |
|------|-------------|---------|
| `-i, --interval <ms>` | Poll interval | `2000` |

### `task-man serve`

Run the bundled web app so you can capture/check tasks from a browser.

```bash
task-man serve                     # local-only (127.0.0.1)
task-man serve --bind 0.0.0.0     # expose on the LAN (see security note)
```

Startup prints the reachable URLs (with `--bind 0.0.0.0`, typically `http://<your-laptop>.local:3030` plus raw LAN IPs as a fallback for devices that don't resolve `.local`).

| Flag | Description | Default |
|------|-------------|---------|
| `--port <port>` | Port to listen on | `3030` |
| `--bind <addr>` | Bind address — `0.0.0.0` enables LAN/container access | `127.0.0.1` |

**Add to Home Screen.** iOS Safari and Android Chrome can install the page as a standalone PWA. The shell caches via a service worker; `/api/*` is never cached.

**Security.** The server has **no auth of its own**. Local-only binding is the gate in dev; in production, Cloudflare Access gates the hostname in front of a tunnel, and the server additionally verifies the Access JWT on every `/api/*` request when `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` are set (see `src/server/access-auth.ts` and [`docs/deploy-plan.md`](../docs/deploy-plan.md)). Only bind `0.0.0.0` on a network where you'd hand your task list to anyone on the wifi — or put a gate in front.

**Authorization.** When Access verification is on, every request is scoped to the verified identity's own tasks (`src/server/scoped-store.ts`): reads are filtered by `owner`, writes stamp it, and another identity's task ids behave like nonexistent ones (404). Two env vars shape this: `TASK_MAN_DEFAULT_OWNER` (email that owns pre-authorization `owner: null` tasks) and `TASK_MAN_AGENTS` (comma-separated `common_name=email` pairs mapping Access service tokens — headless MCP — to the person they act for; unmapped tokens get 403). Without auth (local dev) nothing is scoped. Request bodies are validated with zod (`src/server/schemas.ts`); `owner`, `id`, and timestamps are never client-assignable.

**TUI footer indicator.** While the server is running, the TUI footer shows `● web :3030` (or `● remote` when the TUI itself is in remote mode).

### `task-man login`

Authenticate the TUI against a remote (Cloudflare Access-gated) server. Thin wrapper around `cloudflared access login <remote_url>`; the JWT is cached under `~/.cloudflared/` and refreshed automatically.

### Remote mode

By default all commands operate on the local file. To point the CLI/TUI at a hosted server instead:

```bash
task-man config client.remote_url https://tasks.yourdomain.com
task-man login
task-man config client.mode remote     # switch back with: ... local
```

Headless clients (MCP) use a Cloudflare Access service token instead of the interactive login: set `client.service_token_id` and `client.service_token_secret`.

## Data storage

All data lives in `~/.task-man/`:

| File | Contents |
|------|----------|
| `tasks.json` | Task database (JSON array) |
| `config.json` | User configuration |
| `insights-log.json` | Historical insights for reports |

Task IDs are UUIDs. Most commands accept an unambiguous prefix (e.g., `abc12`).

## Session colors

Tasks created or claimed through MCP carry the Claude Code session's id. Give
the session a color with the `task_session_color` tool (or the `/session-color`
skill) and the TUI marks the session's parent tasks with a dot on the right:
filled `◉` while the session is running, hollow `○` after it ends. Colors match
Claude Code's `/color` palette (red, blue, green, yellow, purple, orange, pink,
cyan) and live in `config.json` under `sessions` — run `/color <name>` in
Claude Code yourself to make the prompt bar match.

The skill ships in this repo at `.claude/skills/session-color/` and auto-loads
when working inside task-man. To use it from any project:

```bash
ln -s "$(pwd)/.claude/skills/session-color" ~/.claude/skills/session-color
```

## Development

```bash
cd cli
npm run dev     # tsx watch on src/index.ts
npm test        # vitest run
npm run test:watch
```

`build:all` rebuilds the web SPA into `cli/dist-web/` (vite writes there directly — no copy step), which the Hono server mounts at runtime.

### Versioning (Changesets)

`cli` and `web` share one version (a Changesets `fixed` group), so `task-man`'s
version is the whole app's version. Every PR must include a changeset — CI's
`changeset` job enforces it:

```bash
npx changeset            # pick a bump level, write a summary
npx changeset add --empty   # for a change that needs no release (docs, CI)
```

Convention for this repo: **write changesets against `task-man`** (list it in
the frontmatter), even for web-only changes — that keeps `cli/CHANGELOG.md` as
the single product changelog. The fixed group bumps `web` in lockstep either
way. Cutting a release (`changeset version` + `vX.Y.Z` tag) is in
[`docs/release-deploy-quickstart.md`](../docs/release-deploy-quickstart.md).

## Exports

Other packages in the repo import from `task-man/*`:

| Subpath | Module |
|---------|--------|
| `task-man/store` | `TaskStore` (sync, file-backed) |
| `task-man/store-interface` | `Store` — the async interface all clients code against |
| `task-man/local-store` | `LocalStore` — async wrapper over `TaskStore` |
| `task-man/remote-store` | `RemoteStore` — HTTP-backed `Store` + CF Access auth providers |
| `task-man/get-store` | `getStore()` — picks local/remote from config |
| `task-man/api-client` | Shared fetch wrapper (`ApiError`, idempotency keys) |
| `task-man/types` | Type definitions |
| `task-man/config` | Config load/save helpers |
| `task-man/handlers` | Server-side handlers (used by routes and MCP) |
| `task-man/report` | End-of-day report generator |
| `task-man/email` | Resend email integration |
| `task-man/sessions` | Claude Code session helpers |
| `task-man/render-html` | HTML rendering for reports |
| `task-man/parse-entry` | Quick-capture parser |
| `task-man/refine-queue` | Refinement queue calculator |
| `task-man/constants` | Shared constants |
| `task-man/local-date` | Local date helpers |
