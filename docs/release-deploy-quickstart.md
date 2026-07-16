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
# GIT_DESCRIBE stamps the build string the server reports at /healthz. It is
# REQUIRED — the compose file reads it (${GIT_DESCRIBE:-dev}); omit it and the
# build reports "dev". `--long` keeps the commit SHA even when sitting exactly
# on an annotated version tag (vX.Y.Z-0-g<sha>, not bare vX.Y.Z). Do NOT use
# `--tags` (that would resolve to the lightweight deploy-vN and stamp
# "deploy-vN").
GIT_DESCRIBE=$(git describe --long --always --dirty)
GIT_DESCRIBE=$GIT_DESCRIBE docker compose -f deploy/docker-compose.yml up -d --build
echo "deployed build stamp: $GIT_DESCRIBE — /healthz must report exactly this"

# 3. verify — /healthz build must equal the stamp echoed above (the Dockerfile
#    also prints it during the build: "==> task-man build stamped: ...");
#    watch for cloudflared "Registered tunnel connection"
docker compose -f deploy/docker-compose.yml exec -T task-man \
  node -e 'fetch("http://localhost:3030/healthz").then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))'
docker compose -f deploy/docker-compose.yml logs -f
```

Note: `task-man whoami` is not on the container's PATH (the entrypoint runs the
server directly), so verify via `/healthz` above, not `whoami`.

**Rollback:** `git checkout deploy-v(N-1) && GIT_DESCRIBE=$(git describe --long --always --dirty) docker compose -f deploy/docker-compose.yml up -d --build`. Same rule: `/healthz` must report the rolled-back stamp.

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
