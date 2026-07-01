# task-man-web

Mobile-first React SPA for capturing and checking tasks from a phone or second device. Served by the Hono server bundled into the [CLI](../cli/README.md) — the build output is copied into `cli/dist-web/` and mounted at runtime.

## What it ships

- **Focus view** — your current focused tasks; tap to complete, swipe-friendly.
- **Quick Capture** — drop a task in without leaving the keyboard.
- **PWA shell** — installable via "Add to Home Screen" on iOS Safari and Android Chrome. The shell caches via a service worker; `/api/*` is never cached.

Plan / Refine / Metrics modes stay in the TUI for now.

## How it talks to the server

All requests are same-origin against `/api/*`. The Vite dev server proxies `/api` to the local `task-man serve` instance; in production the same Hono server serves both the SPA and the API, so the SPA never knows its origin URL.

Auth today is a 4-digit PIN: `POST /api/auth/login` sets a signed cookie (`task-man-session`) that rides along on subsequent requests. The full client lives in [`src/api.ts`](./src/api.ts).

> A planned change (see [`docs/deploy-plan.md`](../docs/deploy-plan.md)) drops the PIN screen in favor of Cloudflare Access gating the whole hostname. Once that lands, the login screen is removed and the API client trusts the session implicitly.

## Develop

```bash
# Terminal 1: run the API
task-man serve --bind 127.0.0.1

# Terminal 2: run the SPA dev server (proxies /api to :3030)
cd web
npm install
npm run dev
```

Or, from the repo root:

```bash
npm run dev      # starts `task-man serve` + web dev concurrently
```

Open the URL Vite prints. Set a PIN once via `task-man serve --set-pin`, then log in.

## Build

```bash
cd web
npm run build    # tsc -b + vite build → web/dist/
```

To ship the new build with the CLI, run from `cli/`:

```bash
cd cli
npm run build:all
# → builds CLI, builds web, copies web/dist into cli/dist-web/
```

If you start `task-man serve` without a built `cli/dist-web/`, the server returns `503` with a "frontend not built" hint instead of pretending it's fine.

## Test

```bash
cd web
npm test         # vitest + jsdom + @testing-library/react
```

## Tech

- Vite 8, React 19, React Router 7
- Imports types from the CLI via `import "task-man"` (workspace `file:../cli`)
- Idempotency keys on writes — `crypto.randomUUID()` when available, a short pseudo-random fallback for plain-HTTP contexts (Safari mobile on `http://laptop.local`)
