# task-man-web

Mobile-first React SPA for capturing and checking tasks from a phone or second device. Served by the Hono server bundled into the [CLI](../cli/README.md) — the Vite build writes directly into `cli/dist-web/`, which the server mounts at runtime.

## What it ships

- **Focus view** — your current focused tasks; tap to complete, swipe-friendly.
- **Quick Capture** — drop a task in without leaving the keyboard.
- **Backlog** — browse and pull unfocused tasks, filter by category.
- **Metrics** — the day's progress, with date navigation.
- **PWA shell** — installable via "Add to Home Screen" on iOS Safari and Android Chrome. The shell caches via a service worker; `/api/*` is never cached.

Plan and Refine stay TUI-only.

## How it talks to the server

All requests are same-origin against `/api/*`. The Vite dev server proxies `/api` to the local `task-man serve` instance; in production the same Hono server serves both the SPA and the API, so the SPA never knows its origin URL.

The app has **no auth of its own** (the old 4-digit PIN screen is gone). In local dev the server binds `127.0.0.1` by default; in production Cloudflare Access gates the whole hostname, and the server verifies the Access JWT on `/api/*` (see [`docs/deploy-plan.md`](../docs/deploy-plan.md)). The full client lives in [`src/api.ts`](./src/api.ts).

## Develop

```bash
# Terminal 1: run the API (binds 127.0.0.1 by default)
task-man serve

# Terminal 2: run the SPA dev server (proxies /api to :3030)
cd web
npm install
npm run dev
```

Or, from the repo root:

```bash
npm run dev      # starts `task-man serve` + web dev concurrently
```

Open the URL Vite prints (`:5173`, not `:3030`) — saves hot-reload in <100ms, and `/api/*` proxies through to your real tasks.

## Build

```bash
cd web
npm run build    # tsc -b + vite build → ../cli/dist-web/
```

The build writes straight into `cli/dist-web/` (see `vite.config.ts`) — there is no separate copy step. `npm run build:all` from `cli/` rebuilds both packages in one go.

If you start `task-man serve` without a built `cli/dist-web/`, the server returns `503` with a "frontend not built" hint instead of pretending it's fine.

**Stale installs on devices**: the PWA registers a service worker (`public/sw.js`), so a phone may keep serving an old shell after a rebuild. If a release doesn't appear, unregister the service worker in DevTools (or wipe site data in iOS Safari).

## Test

```bash
cd web
npm test         # vitest + jsdom + @testing-library/react
```

## Tech

- Vite 8, React 19, React Router 7
- Imports types and the shared HTTP client from the CLI (`task-man/types`, `task-man/api-client`) via the `file:../cli` dependency
- Idempotency keys on writes — `crypto.randomUUID()` when available, a short pseudo-random fallback for plain-HTTP contexts (Safari mobile on `http://laptop.local`)
