# task-man

Personal task manager for developers who live in the terminal. Designed around focus management — pull tasks into a small working set, plan in a flat list, and let Claude help via MCP.

This repo is a small multi-package workspace. Each package has its own README with the full reference.

## Packages

| Path | Package | What it is |
|------|---------|------------|
| [`cli/`](./cli/README.md) | `task-man` | The one publishable package: TUI, bundled Hono server + web app, and the MCP server as a second bin (`task-man-mcp`, source in `cli/src/mcp/`). |
| [`web/`](./web/README.md) | `task-man-web` (private) | Vite/React SPA for mobile / second-device access. Built output is embedded into the CLI as `cli/dist-web/`. |
| [`mcp/`](./mcp/README.md) | — | MCP setup docs + full tool reference. The code lives in `cli/src/mcp/` (merged 2026-07, see [`docs/packaging-plan.md`](./docs/packaging-plan.md)). |

## How they fit together

```
┌─────────────────────────────────────────────────────────────┐
│                        ~/.task-man/                         │
│            tasks.json · config.json · insights-log.json     │
└────────────────────────────▲────────────────────────────────┘
                             │ TaskStore (file lock, atomic writes)
                    ┌────────┴────────┐
                    │  Store (async)  │   getStore() picks per config:
                    │  LocalStore ────┤   local (default) or remote
                    │  RemoteStore ──▶│── HTTPS + Cloudflare Access ──▶ hosted server
                    └────▲───────▲────┘
                         │       │
                    ┌────┴───┐ ┌─┴────────────┐
                    │  TUI   │ │  MCP         │
                    │ (cli/) │ │ (cli/src/mcp)│
                    └────────┘ └──────────────┘

        ┌──────────────────────┐         ┌──────────────────┐
        │  task-man serve      │◀──HTTP──│  web SPA         │
        │  (cli/src/server/)   │         │  (web/, served   │
        │  /api + /api/store   │         │   from dist-web) │
        └──────────────────────┘         └──────────────────┘
```

The TUI and MCP code against an async `Store` interface: `LocalStore` (the default) wraps the in-process `TaskStore`; `RemoteStore` speaks HTTPS to a hosted instance of the same Hono server behind Cloudflare Access. The web SPA always goes over HTTP to its own origin. See [`docs/system-map.md`](./docs/system-map.md) for the full connection map and [`docs/deploy-plan.md`](./docs/deploy-plan.md) for the hosting plan (droplet + Tunnel, not yet deployed).

## Quick start

```bash
git clone <repo-url>
cd task-man

# Build and link — one package provides both the TUI and the MCP server
cd cli && npm install && npm run build && npm link

task-man --version    # confirm install
task-man              # launch the interactive TUI

# Register the MCP server with Claude Code (after linking):
claude mcp add task-man -- task-man-mcp
```

For development across all three packages at once:

```bash
# From repo root
npm install
npm run dev   # starts `task-man serve` + the web dev server concurrently
```

## Documentation

- [`cli/README.md`](./cli/README.md) — CLI commands, TUI keybindings, `task-man serve`, config
- [`web/README.md`](./web/README.md) — web dev and build flow
- [`mcp/README.md`](./mcp/README.md) — MCP setup and full tool reference
- [`docs/system-map.md`](./docs/system-map.md) — terse architecture reference (layers, seams, run modes)
- [`docs/deploy-plan.md`](./docs/deploy-plan.md) — plan to host on DigitalOcean behind Cloudflare
- [`PRD.md`](./PRD.md) — product requirements
- [`CLAUDE.md`](./CLAUDE.md) — repo conventions for Claude Code
