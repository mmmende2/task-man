# task-man

Personal task manager for developers who live in the terminal. Designed around focus management — pull tasks into a small working set, plan in a flat list, and let Claude help via MCP.

This repo is a small multi-package workspace. Each package has its own README with the full reference.

## Packages

| Path | Package | What it is |
|------|---------|------------|
| [`cli/`](./cli/README.md) | `task-man` | The CLI, Ink-based TUI, and bundled Hono server. Also exposes the `TaskStore` API consumed by the other packages. |
| [`web/`](./web/README.md) | `task-man-web` | Vite/React SPA for mobile / second-device access. Built output is embedded into the CLI as `cli/dist-web/`. |
| [`mcp/`](./mcp/README.md) | `task-man-mcp` | MCP server for Claude Code. Lets Claude read/write your tasks. |

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
                    ┌────┴───┐ ┌─┴──────┐
                    │  TUI   │ │  MCP   │
                    │ (cli/) │ │ (mcp/) │
                    └────────┘ └────────┘

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

# Build and link the CLI
cd cli && npm install && npm run build && npm link

# (optional) Build and link the MCP server for Claude Code
cd ../mcp && npm install && npm run build && npm link

task-man --version    # confirm install
task-man              # launch the interactive TUI
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
