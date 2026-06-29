# Architecture at a glance

## The pieces

```
┌────────────────────────────────────────────────────────────────┐
│  ~/.task-man/tasks.json   ← single source of truth on disk     │
└────────────────────────────────────────────────────────────────┘
                ▲
                │  read/write (file lock)
                │
       ┌────────┴────────┐
       │   cli/src       │  TUI (Ink), Hono HTTP server, MCP-able store
       │                 │  scripts: `task-man`, `task-man serve`, etc.
       └────────┬────────┘
                │  HTTP :3030
                │  /api/*  + (in prod) SPA from cli/dist-web/
                ▼
            browser / phone
                ▲
                │
       ┌────────┴────────┐
       │   web/src       │  React SPA (Vite)
       └─────────────────┘
```

## Two run modes

```
PROD ──  task-man serve  ──►  Hono :3030 ──►  /api + cli/dist-web/  ──► phone
                                                    ▲
                                                    │  must be rebuilt:
                                                    │  cli/ $ npm run build:web
                                                    │  (vite build + copy)

DEV  ──  task-man serve              (still running, only handles /api)
     ──  web/ $ npm run dev   ──►  Vite :5173 ──►  HMR'd SPA + proxies /api → :3030
                                                    ▲
                                                    │  saves to web/src/* hot-reload instantly
```

## Why a fresh `vite build` may not show up under `task-man serve`

Prod mode serves the SPA from `cli/dist-web/`. `vite build` writes to `web/dist/`; the `cli/ $ npm run build:web` script is what copies the result across. If the two are out of sync, the server keeps serving the old bundle.

The web app also registers a service worker (`web/public/sw.js`), so a stale install on the device may persist past a rebuild. Unregister it in DevTools (or wipe site data on iOS Safari) when a release doesn't appear.

## Faster iteration loop

In one terminal, keep the API running:

```bash
task-man serve
```

In another, from `web/`:

```bash
npm run dev
```

Then open `http://localhost:5173` (not `:3030`). Vite serves the SPA with hot-module reload — save a `.tsx` or `.css` and the browser updates in <100ms with no rebuild. `/api/*` calls proxy through to `:3030`, so you're hitting your real tasks.

Only run `npm run build:web` (from `cli/`) when you want to test the prod bundle or ship a build.
