# Release & Deploy — Quickstart

Terse reference. First-time infra + full detail: [`phase2-manual-setup-guide.md`](phase2-manual-setup-guide.md).

## Versioning model

- `cli` + `web` share **one** version (Changesets `fixed` group), read from
  `package.json` at runtime as `VERSION`.
- Every feature PR includes a **changeset** (`npx changeset`, or
  `npx changeset add --empty` for a no-release change). CI's `changeset` job
  enforces it.
- A **release** consumes the accumulated changesets into a version bump +
  `CHANGELOG.md`, and is marked with an annotated **`vX.Y.Z`** git tag. That tag
  is the git-describe anchor and the droplet deploy target. (There are no more
  `deploy-vN` tags.)

## Preflight (laptop)

```sh
npm ci && npm run build && npm test    # one workspace: cli then web, all green
```

## Cut a release (laptop)

```sh
# All merged PRs since the last release must carry changesets (CI enforced).
git checkout main && git pull
git checkout -b release/next
npx changeset version                  # bumps the shared version + writes CHANGELOG.md
git commit -am "release"
git push -u origin release/next
gh pr create --title "release" --body "version bump + changelog"
# The changeset gate auto-skips release/* PRs. Merge it, then tag the release
# commit on main (annotated -> git describe anchors here):
git checkout main && git pull
VERSION="v$(node -p "require('./cli/package.json').version")"
git tag -a "$VERSION" -m "$VERSION" && git push origin "$VERSION"
echo "release $VERSION — deploy this tag"
```

## Deploy (droplet)

```sh
ssh mario@<droplet-ip>
cd /opt/task-man/src
git fetch --tags --force && git checkout "$VERSION"     # the vX.Y.Z you just tagged

# GIT_DESCRIBE stamps the build string /healthz reports. REQUIRED — compose
# reads it (${GIT_DESCRIBE:-dev}); omit it and the build reports "dev".
# At a clean release tag this is vX.Y.Z-0-g<sha>; anything ahead/dirty shows
# as vX.Y.Z-N-g<sha>[-dirty], which is your signal you deployed off-release.
GIT_DESCRIBE=$(git describe --long --always --dirty)
GIT_DESCRIBE=$GIT_DESCRIBE docker compose -f deploy/docker-compose.yml up -d --build
echo "deployed build stamp: $GIT_DESCRIBE — /healthz must report exactly this"

# verify — /healthz build must equal the stamp echoed above (the Dockerfile
# also prints it during the build: "==> task-man build stamped: ...");
# watch for cloudflared "Registered tunnel connection"
docker compose -f deploy/docker-compose.yml exec -T task-man \
  node -e 'fetch("http://localhost:3030/healthz").then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))'
docker compose -f deploy/docker-compose.yml logs -f
```

Note: `task-man whoami` is not on the container's PATH (the entrypoint runs the
server directly), so verify via `/healthz` above, not `whoami`.

**Rollback:** `git checkout <previous vX.Y.Z> && GIT_DESCRIBE=$(git describe --long --always --dirty) docker compose -f deploy/docker-compose.yml up -d --build`. Same rule: `/healthz` must report the rolled-back stamp.

**Restart only (no code change):** `docker compose -f deploy/docker-compose.yml restart task-man` — data persists, TUI reconnects on its own.

## `deploy/.env` (droplet, `chmod 600`, never commit)

`TUNNEL_TOKEN` · `CF_ACCESS_TEAM_DOMAIN` · `CF_ACCESS_AUD` · `TASK_MAN_DEFAULT_OWNER` · `TASK_MAN_AGENTS` · `TZ`
Template + where each comes from: [`deploy/.env.example`](../deploy/.env.example). `TZ` is required or evening completions land on tomorrow.

## npm publish — ON HOLD

Publishing to npm is parked (it makes the source public), so Changesets runs in
**version-only** mode — `changeset version` bumps + writes the changelog, and we
never run `changeset publish`. If unparked later:

```sh
cd cli && npm login && npm publish   # prepublishOnly gate builds + tests
```

Single package `task-man`, bins `task-man` + `task-man-mcp`.
