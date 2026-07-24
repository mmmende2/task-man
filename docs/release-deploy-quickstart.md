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

## Writing a changeset (per PR)

```sh
npx changeset              # interactive: pick package(s), bump level, write a summary
npx changeset add --empty  # for a change that needs no release (docs, CI, chores)
```

A changeset is frontmatter (which packages + bump level) plus a summary line:

```markdown
---
"task-man": minor
---
Session dots now show on parent tasks.
```

How the two workspaces interact — the part that trips people up:

- **The version always moves together.** With the `fixed` group, listing *one*
  package bumps *both* to the same number. You never list both just to keep
  versions in sync.
- **The frontmatter decides which `CHANGELOG.md` the summary lands in.**
  Changesets writes a changelog per package; a summary only appears in the
  changelog of a package it names.
- **Convention: always write against `task-man`.** That makes `cli/CHANGELOG.md`
  the single product changelog (web is private and never published, so its own
  changelog carries no meaning). List `task-man-web` too *only* if you want a
  web-only note recorded in `web/CHANGELOG.md` as well — optional.
- **Bump level:** `patch` = fix, `minor` = feature, `major` = breaking. The
  highest level among the pending changesets sets the release bump.

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

Pushing the `vX.Y.Z` tag fires `publish.yml`, which builds and pushes a clean
`ghcr.io/mmmende2/task-man:vX.Y.Z` image (it does not move `:latest`). Wait for
that Publish run to go green, then deploy with `TASK_MAN_TAG=vX.Y.Z` below.

## Deploy (droplet) — pull-based

CI (`publish.yml`) builds and pushes the image to GHCR on every merge to main.
The droplet **only pulls** — no on-box builds (a cold build thrashes the 1GB
box). **Wait for the Publish action to go green** before deploying.

```sh
ssh mario@<droplet-ip>
cd /opt/task-man/src
git pull                       # only needed when deploy/ files changed

# TASK_MAN_TAG is REQUIRED — compose has no default, so you name the version
# every deploy (this is deliberate; typing it is the point). Export it so
# pull/up/logs/ps all see the same value. A published image tag:
#   vX.Y.Z          clean release tag (pushing the git tag publishes it)
#   sha-<short>     immutable, one per commit
#   vX.Y.Z-N-g<sha> the git-describe stamp
export TASK_MAN_TAG=v0.5.1        # the version you're deploying
docker compose -f deploy/docker-compose.yml pull task-man
docker compose -f deploy/docker-compose.yml up -d

# verify — /healthz build must equal the merge commit's `git describe`
# (also visible in the Publish action log); watch for cloudflared
# "Registered tunnel connection"
docker compose -f deploy/docker-compose.yml exec -T task-man \
  node -e 'fetch("http://localhost:3030/healthz").then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))'
docker compose -f deploy/docker-compose.yml logs -f

docker image prune -f          # reclaim old layers (esp. after the first pull-deploy)
```

Note: `task-man whoami` is not on the container's PATH (the entrypoint runs the
server directly), so verify via `/healthz` above, not `whoami`.

**Rollback:** point `TASK_MAN_TAG` at a previous published tag (`vX.Y.Z` or `sha-<short>`) and re-up — no rebuild:
```sh
export TASK_MAN_TAG=v0.5.0        # or sha-<old-short>
docker compose -f deploy/docker-compose.yml pull task-man
docker compose -f deploy/docker-compose.yml up -d
```
`/healthz` must report the rolled-back stamp. Only tags published since this
pull-based flow went live exist in GHCR — to roll back to an older release,
use the emergency on-box build below.

**Restart only (no code change):** `docker compose -f deploy/docker-compose.yml restart task-man` — data persists, TUI reconnects on its own.

**Emergency on-box build** (CI/GHCR down, or testing an un-merged change) — layer the build override; this is the *old* slow path, so add a swapfile first:
```sh
GIT_DESCRIBE=$(git describe --long --always --dirty) \
  docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.build.yml up -d --build
```

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
