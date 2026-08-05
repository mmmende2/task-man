---
name: release
description: Cut a task-man release and hand off the droplet deploy — changeset version bump, release PR, annotated vX.Y.Z tag, watching the publish workflow, and producing copy-pasteable deploy commands for the operator to run. Use whenever the user wants to release, ship, cut a version, publish a new version, deploy to the droplet, or roll back a bad deploy, and when asked what's pending release or whether a deploy went out. Claude does the laptop-side git and CI work; the operator runs everything on the droplet.
---

A release is two halves with a hard boundary between them. Claude does the
laptop half — version bump, PR, tag, watching CI. The operator does the droplet
half. **Never SSH to the droplet and never run a deploy command against it**,
even if you have working credentials and the user seems to expect it. The
droplet is the one place where a mistake is live and hard to reverse, and the
operator is the one who should see what happens there. Your job on that half is
to produce instructions good enough that the operator never has to improvise.

Full background: `docs/release-deploy-quickstart.md`. This skill is the
operational path.

## Before starting

Confirm the version being cut and that main is release-ready:

```sh
git checkout main && git pull
npx changeset status --since=origin/main   # what's pending
npm ci && npm run build && npm test        # all green before cutting
```

If there are no pending changesets with a bump level, there's nothing to
release — say so rather than cutting an empty version.

## The laptop half (you do this)

`npx changeset version` is non-interactive and safe to run. (Bare `npx
changeset` is the interactive one that hangs — see the `changeset` skill.)

```sh
git checkout -b release/next
npx changeset version          # consumes changesets → version bump + CHANGELOG.md
node -p "require('./cli/package.json').version"   # confirm the new number
git commit -am "release vX.Y.Z"
git push -u origin release/next
gh pr create --title "release vX.Y.Z" --body "version bump + changelog"
```

CI's `changeset` job auto-skips `release/*` branches, so the missing-changeset
gate won't block this PR. Read `cli/CHANGELOG.md` before pushing — it's the
public release note, assembled from entries written at different times, and
this is the last moment to catch one that reads wrong out of context.

After the PR merges, tag the release commit on main:

```sh
git checkout main && git pull
VERSION="v$(node -p "require('./cli/package.json').version")"
git tag -a "$VERSION" -m "$VERSION"      # annotated: this is the git-describe anchor
git push origin "$VERSION"
```

The tag must be annotated (`-a`). A lightweight tag breaks the describe anchor
that stamps the image.

## Watch the publish workflow (you do this)

Pushing the tag fires `publish.yml`. **A release produces two runs** — one from
the merge to main, one from the tag push. They are not interchangeable: the tag
run is what publishes `ghcr.io/mmmende2/task-man:vX.Y.Z`, and that is the image
the operator deploys. A release tag does not move `:latest`.

```sh
until [ "$(gh run list --workflow=publish.yml -L 4 --json status \
  --jq '[.[]|select(.status!="completed")]|length')" = "0" ]; do sleep 20; done
gh run list --workflow=publish.yml -L 4 \
  --json databaseId,headBranch,conclusion,createdAt \
  --jq '.[] | [.createdAt, .headBranch, .conclusion, (.databaseId|tostring)] | @tsv'
```

Then confirm the tag run stamped itself correctly:

```sh
gh run view <tag-run-id> --log | grep -aE "publishing:|stamp verified|task-man build stamped"
```

The stamp must read `vX.Y.Z-0-g<sha>` — anchored to this release with zero
commits past it. A stamp naming the *previous* release means the image is
mislabeled; stop and investigate rather than handing off a deploy. (This is a
real failure that shipped once: v0.6.0's image stamped itself `v0.5.1-5-g…`
because `actions/checkout` rewrites an annotated tag as lightweight. `publish.yml`
now has a `verify the release stamp` step that fails the build instead, so a red
publish here is the guard working.)

Do not hand off the deploy until the tag run is green.

## The droplet half (the operator does this)

Give the operator one block they can paste, with the version already filled in —
not a description of what to do. State what success looks like so they can tell
a good deploy from a bad one without asking.

**Decide whether `git pull` belongs in the block before you write it.** The
droplet's checkout exists for one reason: to supply `deploy/docker-compose.yml`
for `-f` to read. Nothing is built on the box — the compose service is `image:`
with no `build:`, so it can only pull from GHCR. If the deploy config didn't
change, pulling the repo accomplishes nothing:

```sh
git diff --stat <previous-tag>..<this-tag> -- deploy/ Dockerfile
```

Empty → omit the `git pull` line. Non-empty → include it, and say which file
changed and why it matters. Don't hedge with a "only needed if…" comment: it's
the first line of a block someone is about to paste, which is exactly where an
optional-looking step reads as mandatory, and the operator has no way to
evaluate the condition.

```sh
ssh <your-droplet>
cd /opt/task-man/src

export TASK_MAN_TAG=vX.Y.Z     # required — compose has no default, by design
docker compose -f deploy/docker-compose.yml pull task-man
docker compose -f deploy/docker-compose.yml up -d

# verify: build must read vX.Y.Z-0-g<sha>
docker compose -f deploy/docker-compose.yml exec -T task-man \
  node -e 'fetch("http://localhost:3030/healthz").then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))'

docker compose -f deploy/docker-compose.yml logs -f   # want: "Registered tunnel connection"
docker image prune -f          # reclaim old layers
```

Tell them the exact `build` string to expect from `/healthz`, taken from the CI
log you just read. That comparison is the whole verification — matching means
the running container is the image CI built from the tag.

`task-man whoami` is not on the container's PATH, so `/healthz` is the check.

**Rollback** — no rebuild, just an older published tag:

```sh
export TASK_MAN_TAG=vX.Y.Z-previous
docker compose -f deploy/docker-compose.yml pull task-man
docker compose -f deploy/docker-compose.yml up -d
```

Only tags published since the pull-based flow went live exist in GHCR. Offer
the rollback command proactively alongside the deploy block — the moment
someone needs it is the worst moment to go looking for it.

Rollback never needs `git pull` either. The old image already carries its own
code; only `deploy/docker-compose.yml` comes off disk, and rolling the app back
does not roll the compose file back.

## Security — this repo is public

Everything you write to the repo, a PR, a commit message, or a changelog is
world-readable. That shapes what can go where:

- **Never commit infrastructure identifiers.** No droplet IP or hostname, no
  deployed URL, no tunnel or Access identifiers. `docs/` deliberately uses
  `<droplet-ip>` placeholders — match that. If the user mentions a real host in
  chat, keep it in chat; it does not follow you into a file.
- **Never read or echo `deploy/.env`.** It holds the tunnel token and Access
  secrets. Nothing in a release needs its contents.
- **Don't ask the operator for output that embeds secrets.** `docker compose
  config` expands `.env` into plaintext, and `docker inspect` and `env` dumps do
  the same. Ask for `/healthz` output, `docker compose ps`, or a specific log
  line instead — those are safe to paste back. If they paste something sensitive
  anyway, say so plainly and don't repeat it back or write it to a file.
- **Changelog entries are release notes, not incident notes.** Describing a
  security fix in operational detail hands over a recipe for the versions still
  running. Say what to upgrade to, not how to exploit what came before.

## Reporting back

Report what you verified, not what you assume. You can confirm the tag pushed,
the workflow went green, and the stamp CI logged. You cannot confirm the deploy
landed — you didn't run it. Ask for the `/healthz` line and compare it to the CI
stamp yourself rather than treating a silent terminal as success.
