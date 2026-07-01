# task-man (CLI)

The main package: a terminal task manager with subcommands, an Ink-based interactive TUI, and a bundled Hono server that powers the [web SPA](../web/README.md).

Also re-exports the `TaskStore` and related modules used by [`mcp/`](../mcp/README.md) and `web/` via the package entries in [`package.json`](./package.json).

## Install

### Prerequisites

- Node.js >= 18
- npm

### From source

```bash
cd cli
npm install
npm run build
npm link        # exposes `task-man` globally
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

Running `task-man` with no arguments opens the TUI. Four modes:

| Key | Mode | Purpose |
|-----|------|---------|
| `f` | Focus | Work through your focused tasks |
| `p` | Plan | Organize focused + backlog lists |
| `w` | Write | Quick-add tasks from a prompt |
| `m` | Metrics | View stats and generate end-of-day reports |

`S` cycles the scope filter: all / personal / professional.

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
| `cc` | Clear title and edit from scratch |
| `o` | Create new task below |
| `O` | Create new task above |
| `Esc` / `Enter` | Save edit |

**Actions**

| Key | Action |
|-----|--------|
| `x` | Toggle done / todo |
| `Space` | Toggle focused / backlog (plan mode) |
| `dd` | Cut task (enter holding mode) |
| `p` | Paste below (in holding mode) |
| `P` | Paste above (in holding mode) |
| `u` | Undo last action |
| `/` | Search / filter tasks |

`dd`/`p` reordering is only available in plan mode. Cut, navigate, paste.

## CLI reference

### `task-man add <title>`

Create a new task.

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --priority <level>` | `low`, `medium`, `high` | `high` |
| `-s, --scope <scope>` | `personal`, `professional` | `personal` |
| `-c, --category <name>` | Category tag (repeatable) | — |
| `--parent <id>` | Parent task ID (creates subtask) | — |
| `-d, --description <text>` | Description | — |
| `--created-by <who>` | `human`, `claude` | `human` |
| `-f, --focused` | Add directly to focus list | backlog |

```bash
task-man add "Write tests" -p medium -c testing -s professional
task-man add "Unit tests for store" --parent abc12
```

### `task-man list`

| Flag | Description |
|------|-------------|
| `-s, --scope <scope>` | Filter by `personal` or `professional` |
| `--status <status>` | Filter by `todo`, `in_progress`, `done` |
| `--focused` | Show only focused tasks |
| `--backlog` | Show only backlog tasks |
| `-c, --category <name>` | Filter by category |

### `task-man done <id>` / `task-man start <id>`

Mark a task as `done` / `in_progress`. Accepts full ID or unambiguous prefix.

### `task-man focus <id>` / `task-man unfocus <id>`

Move a task into / out of the focused working set.

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

Config lives at `~/.task-man/config.json`.

### `task-man end-day`

Generate an end-of-day report.

| Flag | Description |
|------|-------------|
| `--date <date>` | Date in `YYYY-MM-DD` or `yesterday` |
| `--email` | Send report via email (requires config) |

### `task-man watch`

Live-updating display of focused tasks. Useful as a sidebar.

| Flag | Description | Default |
|------|-------------|---------|
| `-i, --interval <ms>` | Poll interval | `2000` |

### `task-man session-refocus`

Refocus all tasks linked to the current Claude Code session (detected via `CLAUDE_SESSION_ID`). Useful after an autonomous Claude run when you want to surface what it touched.

### `task-man serve`

Run the bundled web app on your LAN so you can capture/check tasks from a phone or second laptop on the same wifi.

```bash
task-man serve --set-pin     # one-time: set the 4-digit PIN
task-man serve               # start the server
```

The first run prints reachable URLs (typically `http://<your-laptop>.local:3030` plus raw LAN IPs as a fallback for devices that don't resolve `.local`). Enter the PIN on first visit; the session cookie lasts 30 days.

| Flag | Description | Default |
|------|-------------|---------|
| `--port <port>` | Port to listen on | `3030` |
| `--bind <addr>` | Bind address — `127.0.0.1` disables LAN | `0.0.0.0` |
| `--set-pin` | Set the 4-digit PIN, then exit | — |

**Add to Home Screen.** iOS Safari and Android Chrome can install the page as a standalone PWA. The shell caches via a service worker; `/api/*` is never cached.

**Scope.** The web v1 ships only the mobile-first Focus view and Quick Capture. Plan / Refine / Metrics stay TUI-only.

**Security.** PIN gates the LAN endpoint with rate limiting (5 attempts per 5 min per IP, then exponential backoff). Enough to keep a roommate off it; explicitly **not** real auth. A determined LAN attacker is out of the threat model. Use `--bind 127.0.0.1` to disable LAN.

**TUI footer indicator.** While the server is running, the TUI footer shows `● web :3030`.

> A planned change (see [`docs/deploy-plan.md`](../docs/deploy-plan.md)) replaces PIN auth with Cloudflare Access and makes the TUI a remote client of a hosted server. The flags above describe today's behavior.

## Data storage

All data lives in `~/.task-man/`:

| File | Contents |
|------|----------|
| `tasks.json` | Task database (JSON array) |
| `config.json` | User configuration |
| `insights-log.json` | Historical insights for reports |

Task IDs are UUIDs. Most commands accept an unambiguous prefix (e.g., `abc12`).

## Development

```bash
cd cli
npm run dev     # tsx watch on src/index.ts
npm test        # vitest run
npm run test:watch
```

`build:all` rebuilds the web SPA and copies `web/dist` into `cli/dist-web/`, which the Hono server mounts at runtime.

## Exports

Other packages in the repo import from `task-man/*`:

| Subpath | Module |
|---------|--------|
| `task-man/store` | `TaskStore` |
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
