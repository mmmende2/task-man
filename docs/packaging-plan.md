# Packaging & Distribution Plan — sharing the parts separately

Status: **steps 1–2 executed 2026-07-04** (MCP merged into `cli/src/mcp/`
as the `task-man-mcp` bin; publish hygiene in place; MIT licensed;
version 0.2.0). **Publishing is ON HOLD per Mario (2026-07-04)** — steps
3–4 below are parked, not abandoned: the package is publish-ready
(`npm publish` from `cli/` + `npm login` is all that remains), and the
npm-based Dockerfile stays gated on that publish. Until then the deploy
path is the existing build-from-source `cli/Dockerfile`, and the npm name
`task-man` remains unclaimed (known risk, accepted).
(Originally proposed same day; revised after Mario challenged the separate
MCP package — he was right.) Answers: does `npm install task-man` still
make sense, and how do we share/export the tool's parts?

## Verdict on the npm funnel

**Yes — the funnel you envisioned maps cleanly onto what's already built:**

```
npx task-man            → TUI, local JSON, zero config     (try it)
task-man serve          → phone/web UI on your LAN         (like it)
task-man config … +
task-man login          → remote mode against a hosted     (commit to it)
                          Cloudflare-Access-gated server
```

Local mode *is* the trial: no account, no network, one command. Remote mode
is an explicit config flip (`client.mode = remote`), which is exactly the
"upgrade" moment. Nothing about the recent work broke this — the CLI
retirement removed the CRUD subcommands, but the funnel never depended on
them (TUI + serve are the product).

**One honest caveat — "creating an account" doesn't exist yet.** Today the
remote story is bring-your-own-Cloudflare: either you run your own droplet +
Access app (phase2 guide), or someone who runs one adds your email to their
Access policy. There's no signup, no hosted multi-tenant service. The
authorization layer (per-identity namespaces) means one deployment *can*
host several people, so "account creation" for a colleague is: (1) add
email to the Access policy, (2) they run `task-man config` + `login`. If a
real signup flow ever matters, that's a hosted-service product decision far
beyond packaging — out of scope here, flagged so the README never promises
"accounts."

## Correction: the MCP is not inside the npm package

`task-man-mcp` is already a separate package with its own `bin` — it was
never bundled into the `task-man` artifact. What ties them together is:

```json
"task-man": "file:../cli"      // in mcp/package.json
```

`file:` deps only resolve inside this repo, so **neither package is
publishable as-is**. That's the actual blocker, not bundling.

## Target shape: ONE npm artifact, two bins

| Artifact | Channel | Contents | Consumer |
|---|---|---|---|
| **`task-man`** | npm (name is free — verified 2026-07-04) | TUI, `serve` + baked web bundle (`dist-web/`), remote client, config/login, **and the MCP server as a second bin (`task-man-mcp`)** | humans: `npx task-man` · Claude: `claude mcp add task-man -- npx -y --package=task-man task-man-mcp` |
| **Self-host deploy** | git repo (`deploy/` + Dockerfile) | droplet compose, Tunnel, Access | whoever runs a server |

`web/` stays private forever — it is a build input whose output ships inside
`task-man` as `dist-web/`. Publishing it separately would only create a
version-skew problem that doesn't exist today.

**Why the MCP folds in rather than shipping as its own npm package** (the
original draft proposed `task-man-mcp` as a second package; rejected):

- Its only audience is people who already use task-man — a second package
  doubles publish/version surface for zero added reach.
- The MCP is a thin adapter over `task-man`'s handlers and must move in
  lockstep with them. A `task-man@^x` semver range is a skew hazard
  (mcp@0.2 resolving against task-man@0.2.7 handler behavior it never saw),
  not an independence benefit. Same package = versions can't skew.
- The `file:` dep problem vanishes entirely: merged in, the MCP's imports
  of `task-man/handlers` etc. become package self-references (supported by
  Node via the existing `exports` map) — no cross-package dep at all.

The eventual "colleagues install nothing" path is a **remote MCP endpoint**
on the droplet (a URL behind Access). Not built now — the stdio MCP already
reaches the hosted store through `RemoteStore` — but it's one more reason
not to invest in a standalone npm package that path would obsolete.

## The work, in order

### 1. Merge `mcp/` into the cli package

- Move `mcp/src/*` → `cli/src/mcp/` (imports of `task-man/...` keep working
  as self-references; or flip to relative `../handlers/index.js` — either
  is fine, pick one and be consistent).
- `cli/package.json` gains `"task-man-mcp": "./dist/mcp/index.js"` in `bin`
  and the two MCP deps (`@modelcontextprotocol/sdk`, `zod` — zod is already
  there from validation).
- Delete `mcp/package.json` + its lockfile; move its README content to
  `mcp` sections of the cli README or keep `mcp/README.md` as a pointer.
- Update Mario's local Claude config to the new path (or, post-publish,
  the npx form) and the Dockerfile (one install stage disappears).
- Tests: MCP had none of its own; the tool handlers are covered via cli.

### 2. Make `task-man` publish-clean

- `files: ["dist", "dist-web", "README.md"]` — today there's no whitelist,
  so `npm publish` would ship src/, tests, and tsconfig.
- `prepublishOnly: "npm run build && npm run build:web && vitest run"` — the
  web bundle must be baked before every publish; a publish with a stale
  `dist-web/` is the most likely silent failure.
- Add `license` (repo has **no LICENSE file** — decide: MIT if public
  sharing is the goal, or UNLICENSED if this stays personal), `repository`,
  `engines: { "node": ">=18" }`, `keywords`.
- Version bump to `0.2.0` (the authorization/scope work is a real minor).

### 3. Publish & release process

One package, one version, one command: `npm publish` from `cli/` after the
`prepublishOnly` gate. Tag `v0.2.0`. Manual until it hurts — a GitHub
Action on tag is the upgrade when it does. The MCP install one-liner goes
in the README:
`claude mcp add task-man -- npx -y --package=task-man task-man-mcp`
(remote mode needs nothing extra — it reads the same
`~/.task-man/config.json` the TUI's `login` wrote).

### 4. Deploy simplification (after first publish)

The Dockerfile currently multi-stage-builds from a git checkout because npm
had no package. Once `task-man@0.2.0` is on the registry, replace it:

- New `deploy/Dockerfile`: `FROM node:22-slim` +
  `npm i -g task-man@<pinned version>` + the same
  `CMD ["task-man", "serve", "--bind", "0.0.0.0", "--port", "3030"]`.
  Version pinning moves from git tags to npm versions.
- `deploy/docker-compose.yml`: point at the new Dockerfile (env/volumes/
  networks unchanged).
- `docs/phase2-manual-setup-guide.md` step 3 shrinks by half: no repo clone
  or tag checkout on the droplet — just `.env` + `docker compose up -d`.
  Redeploys become "bump the pinned version, rebuild."
- Delete `cli/Dockerfile` (the build-from-source path) once the npm path is
  proven on the droplet — unreleased testing is what `task-man serve` on the
  laptop is for.

**No workspaces** (decided 2026-07-04): with the MCP merged there is no
publishing need, and the dev-ergonomics upside isn't worth the churn. `web`
keeps its build-time `file:../cli` dep; it never ships.

### 5. Deferred: `@task-man/core` extraction

An MCP-only install currently pulls the full `task-man` package including
ink/react (the TUI). Harmless — Node never loads what `tools.ts` doesn't
import, thanks to the `exports` map — but it's ~20MB of dead weight in the
install. If that ever matters, extract store/handlers/types/filters into
`@task-man/core` and have both apps depend on it. Not worth the churn now;
the exports map already gives us the module boundaries we'd need.

## Onboarding funnel, as the README will tell it

1. **Try**: `npx task-man` — everything local in `~/.task-man/`.
2. **Phone**: `task-man serve --bind 0.0.0.0` on your laptop's wifi.
3. **Claude**: `claude mcp add task-man -- npx -y --package=task-man task-man-mcp`.
4. **Go remote** (joining an existing deployment): get your email added to
   its Access policy, then
   `task-man config client.mode remote` /
   `client.remote_url https://…` / `task-man login`.
   MCP-remote additionally needs a service token + `TASK_MAN_AGENTS` entry
   from the server admin.
5. **Run your own**: `docs/phase2-manual-setup-guide.md`.

## Open decisions for Mario

- **License** — MIT (shareable) or keep it unpublished-personal a while
  longer? Publishing to npm makes the code public regardless of the repo.
- **Name** — `task-man` is free today; claim it early (a placeholder 0.0.1
  publish reserves it) or accept the risk it gets taken.
- **Publish now vs. after the droplet ships** — nothing in this plan blocks
  the droplet; the two can proceed in either order.

Sizing: steps 1–3 (merge + hygiene + first publish) are one focused
session; step 4 (npm-based Dockerfile) is a short follow-up gated on the
publish existing, verified when the droplet ships.
