# task-man-web

Mobile-first React SPA for capturing and checking tasks from a phone or second device. Served by the Hono server bundled into the [CLI](../cli/README.md) — the Vite build writes directly into `cli/dist-web/`, which the server mounts at runtime.

## What it ships

- **Focus view** — your current focused tasks; tap to complete, swipe-friendly.
- **Quick Capture** — drop a task in without leaving the keyboard.
- **Backlog** — browse and pull unfocused tasks, filter by category.
- **Refine** — the card-flip triage loop: one tap-sized question at a time (scope, time, vibe, priority, focus, category), one-step undo. Shares the exact question logic with the TUI (`task-man/refine-questions`).
- **Metrics** — the day's progress, with date navigation.
- **PWA shell** — installable via "Add to Home Screen" on iOS Safari and Android Chrome. The shell caches via a service worker; `/api/*` is never cached.

Plan stays TUI-only.

## How it talks to the server

All requests are same-origin against `/api/*`. The Vite dev server proxies `/api` to the local `task-man serve` instance; in production the same Hono server serves both the SPA and the API, so the SPA never knows its origin URL.

The app has **no auth of its own** (the old 4-digit PIN screen is gone). In local dev the server binds `127.0.0.1` by default; in production Cloudflare Access gates the whole hostname, and the server verifies the Access JWT on `/api/*` (see [`docs/deploy-plan.md`](../docs/deploy-plan.md)). The full client lives in [`src/api.ts`](./src/api.ts).

## Develop

Install once from the repo root — this is an npm workspace, so a single
`npm install` sets up both `cli` and `web`:

```bash
npm install      # from the repo root
```

Then:

```bash
# Terminal 1: run the API (binds 127.0.0.1 by default)
task-man serve

# Terminal 2: run the SPA dev server (proxies /api to :3030)
npm run dev -w task-man-web
```

Or, from the repo root, both at once:

```bash
npm run dev      # starts `task-man serve` + web dev concurrently
```

Open the URL Vite prints (`:5173`, not `:3030`) — saves hot-reload in <100ms, and `/api/*` proxies through to your real tasks.

## Build

```bash
npm run build -w task-man-web    # tsc -b + vite build → ../cli/dist-web/
```

The build writes straight into `cli/dist-web/` (see `vite.config.ts`) — there is no separate copy step. `web` imports resolve against `cli/dist`, so `cli` must be built first; `npm run build` at the repo root does both in order (cli, then web).

If you start `task-man serve` without a built `cli/dist-web/`, the server returns `503` with a "frontend not built" hint instead of pretending it's fine.

**Stale installs on devices**: the PWA registers a service worker (`public/sw.js`), so a phone may keep serving an old shell after a rebuild. If a release doesn't appear, unregister the service worker in DevTools (or wipe site data in iOS Safari).

## Test

```bash
npm test -w task-man-web    # vitest + jsdom + @testing-library/react
```

## Tech

- Vite 8, React 19, React Router 7
- Imports types and the shared HTTP client from the CLI (`task-man/types`, `task-man/api-client`). This is an npm workspace: `task-man` is a `"*"` dependency that npm symlinks to `../cli`, so imports resolve against the live `cli/dist` — build `cli` first (the root `build` script does)
- Idempotency keys on writes — `crypto.randomUUID()` when available, a short pseudo-random fallback for plain-HTTP contexts (Safari mobile on `http://laptop.local`)
