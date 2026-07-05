# Release & Deploy — Quickstart

Terse reference. First-time infra + full detail: [`phase2-manual-setup-guide.md`](phase2-manual-setup-guide.md).

## Preflight (laptop)

```sh
cd cli && npm run build && npx vitest run   # dist + tests green
cd ../web && npm run build                  # web bundle → cli/dist-web/
```

## Deploy a new version (droplet)

```sh
# 1. laptop: tag the release
git tag deploy-vN && git push origin deploy-vN

# 2. droplet
ssh mario@<droplet-ip>
cd /opt/task-man/src
git fetch --tags --force && git checkout deploy-vN
docker compose -f deploy/docker-compose.yml up -d --build

# 3. verify (watch for cloudflared "Registered tunnel connection")
docker compose -f deploy/docker-compose.yml logs -f
```

**Rollback:** `git checkout deploy-v(N-1) && docker compose -f deploy/docker-compose.yml up -d --build`.

**Restart only (no code change):** `docker compose -f deploy/docker-compose.yml restart task-man` — data persists, TUI reconnects on its own.

## `deploy/.env` (droplet, `chmod 600`, never commit)

`TUNNEL_TOKEN` · `CF_ACCESS_TEAM_DOMAIN` · `CF_ACCESS_AUD` · `TASK_MAN_DEFAULT_OWNER` · `TASK_MAN_AGENTS` · `TZ`
Template + where each comes from: [`deploy/.env.example`](../deploy/.env.example). `TZ` is required or evening completions land on tomorrow.

## npm publish — ON HOLD

Parked (publishing makes the source public). When unparked:

```sh
cd cli && npm login && npm publish   # prepublishOnly gate builds + tests
```

Then tag `vX.Y.Z`. Single package `task-man`, bins `task-man` + `task-man-mcp`.
