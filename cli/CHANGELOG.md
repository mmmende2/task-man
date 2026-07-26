# task-man

## 0.6.1

### Patch Changes

- 1e25189: Refine: the Claude scope/priority review cards now sit ahead of the "file this under" category gap. Because the reviews are glance-once, the 3-card cap could previously bump them off a brand-new Claude task entirely; ordering them ahead of the lower-value category question lets the scope review surface on the first pass, with the category card riding a later refine pass.
- fbd8717: Refine stops re-asking "How urgent is this, really?" forever on old tasks. A stale todo (untouched >30 days, not high priority) was a queue-admitting `review`, so a task with every gap already filled — time, vibe, category — still entered the queue for a priority card whose only satisfying answer was `high`: answering `medium` or `low` left it stale, requeued it immediately, and refine asked the identical question every session. Two changes settle it:

  - **Staleness is now measured from `updated_at`, not `created_at`.** `created_at` is immutable, so the old check had no termination condition at all. Answering the card writes a priority, which bumps `updated_at` and buys the nudge another 30 days of quiet. Skipping writes nothing, so a skipped task correctly stays stale.
  - **The stale trigger is split off `priority_review` into its own `ride_along` aspect.** Staleness is a recurring condition, not a metadata gap, so it no longer admits a task to the queue on its own — it only adds a priority card to a task already queued for a real gap. Refine's queue is now strictly "tasks with metadata we don't have." The glance-once Claude review keeps its `review` kind and still queues brand-new Claude tasks; the two aspects share the `priority_review` routing key and collapse to one card when both fire.

  This is the same shape as the two prior fixes in this area (v0.5.1, v0.6.0): a gate keyed on a field that never changes, so nothing could tell an already-answered task apart.

- fbd8717: Refine no longer dies when an optimistic store write fails. Answering a card writes fire-and-forget — the keypress handlers can't await, and the UI advances ahead of the write on purpose — but nothing owned the resulting promise. `launchInteractive` nets transport-shaped rejections (`ApiError`, `TypeError`, unreachable/denied) and deliberately rethrows everything else, and `Task <id> not found` is a plain `Error`: delete a task from the web while its card is on screen, answer that card, and the rethrow killed the TUI session.

  All three fire-and-forget writes in refine (answer, undo, delete) now go through one `settleWrite` helper that reloads on success and logs the failure to the debug log on rejection, which is exactly what that code's own comment already promised ("on failure the 2s poll re-syncs truth"). The global handler still crashes loudly on genuinely unexpected rejections everywhere else.

  This was also the cause of an intermittent CI failure: the un-owned writes outlived the test that issued them and rejected against the next test's store, failing the run at random with all assertions passing. Covered by a regression test that asserts no `unhandledRejection` escapes when the store rejects — verified to fail without the fix.

- fbd8717: Fix the release image stamping itself with the _previous_ release, and colour the TUI's build token.

  **The stamp.** `/healthz` on the v0.6.0 deploy reported `build: v0.5.1-5-g939826d`. This was previously blamed on the GHA layer cache (and #50's `no-cache-filters: runtime` was added for it) but that was not the cause. The publish workflow's two runs for the same release commit disagreed: the merge-to-main run computed `v0.6.0-0-g939826d` correctly, while the **tag** run — the one that publishes `:v0.6.0`, the image you actually deploy — computed `v0.5.1-5-g939826d`.

  `actions/checkout` resolves a tag push by force-fetching the triggering SHA straight into the tag ref:

  ```
  git fetch --no-tags origin +939826d…:refs/tags/v0.6.0
  ```

  That replaces the **annotated** tag object with a **lightweight** one. A bare `git describe` only considers annotated tags, so it skipped v0.6.0 and walked back to the previous release. Every `git describe` in the repo now passes `--tags` (count lightweight tags) and `--match 'v[0-9]*'` (ignore stray non-release tags, which could otherwise become the anchor outright) — publish.yml, ci.yml, the TUI's own resolver, the Dockerfile comment and the deploy docs.

  A new `verify the release stamp` step fails the publish loudly if a `vX.Y.Z` tag build's describe isn't anchored to `vX.Y.Z-0-g<sha>`, or if `cli/package.json` disagrees with the tag — so a mis-stamped release is a red build, not a wrong image. `no-cache-filters: runtime` is kept: the cache hazard is real and separate, just not what caused this.

  **The colour.** The TUI footer now paints the build token yellow when it's present, so a non-release build catches the eye. A clean release has no token at all and stays entirely grey.

- fbd8717: The TUI footer version now tells you when you're running code that isn't the release. `VERSION` comes from `package.json`, which Changesets only bumps at release time — so on a feature branch whose changesets haven't been consumed, the footer confidently displayed the _previous_ release (e.g. `v0.6.0` while running four commits past it). The footer now resolves `git describe` at startup and appends a suffix whenever the running code differs from the release tag:

  - `v0.6.0` — sitting exactly on the release tag, clean tree
  - `v0.6.0 · +3 fd86c26` — three commits past v0.6.0
  - `v0.6.0 · +3 fd86c26*` — ...with uncommitted changes (trailing `*`)

  The label still leads with the compiled `VERSION` rather than the raw describe string, mirroring web's `formatVersionLabel`: a describe tag anchor can lag the real release, so `v0.5.1-5-g939826d` would misleadingly read as 0.5.1 on a 0.6.0 build.

  Resolution order: the `TASK_MAN_BUILD` stamp (injected into the Docker image, which has no `.git`) wins; otherwise it shells out to `git describe` in the module's own directory. It's skipped entirely for an installed copy (path under `node_modules`), where git would either fail or silently describe whatever unrelated repo the install happens to sit inside. Any failure falls back to the bare version — resolved once at module load, since the footer re-renders on every pulse tick.

  `--version`, the MCP server version, and `whoami`'s `client_version` are unchanged: those are semver contracts, not display surfaces.

- 0c44ad7: Web: the nav menu and Status page now show the deployed **version** (from package.json) plus the short commit hash — e.g. `v0.6.0 · 939826d` — instead of the raw git-describe build stamp. The describe stamp's tag anchor can lag a release (a CI build-cache artifact that made a 0.6.0 deploy read misleadingly as `v0.5.1-5-g939826d`); the package version is compiled in and always correct, so it leads, with the commit hash kept for pinning the exact build.

## 0.6.0

### Minor Changes

- 318ca04: Refactor Refine onto a single derived "aspect" model (`refine-aspects.ts`): the queue and the question cards are now derived from one ordered list instead of two parallel definitions kept in sync by hand, and both the TUI and web route each answer by a stable `reason` id instead of matching the card's prompt text. Behavior: cards ask gaps first (time → vibe → category), then the Claude scope/priority reviews, then focus; the Claude reviews are now **glance-once** — they appear only on a brand-new Claude task and never re-ask once you've engaged it. This settles the root cause of Refine re-asking scope/priority (those fields always carry a default, so there was no "answered" signal to detect). The "does it belong?" delete card is preserved.

## 0.5.1

### Patch Changes

- 79ae52f: Fix the runtime Docker image crash-looping on `serve` (502 via cloudflared). `npm ci --omit=dev` in the `prod-deps` stage drops the devDependency that was the only thing hoisting `chalk` to the root `node_modules`, leaving cli's `chalk@5` stranded in `cli/node_modules`. The runtime stage copied only the root tree, so `chalk` was absent and `import chalk` in `serve` threw `MODULE_NOT_FOUND` (exit 1 → restart loop). The runtime image now also carries the workspace's un-hoisted `cli/node_modules`. Landed via the npm-workspaces migration (v0.5.0); the image built green because the full-install build/CI stage hoists chalk fine — only the `--omit=dev` prune strands it.
- 551b8ea: Refine stops re-asking priority (and re-queuing) a Claude-created task once it's been refined. The `from_claude` queue reason and the "How urgent is this, really?" priority card now clear once the task has both a time estimate and a vibe, instead of firing forever off `created_by === 'claude'` (which never changes, and priority always has a value, so nothing could tell an already-reviewed task apart). One shared `needsClaudeRefine` predicate keeps the queue and the cards in sync. Fixes both the TUI and web.

## 0.5.0

### Minor Changes

- 5e94fb7: Adopt Changesets for versioning. `cli` and `web` share one fixed version, bumped from a changeset per PR with an auto-generated `CHANGELOG.md`. Releases are cut with `changeset version` and tagged `vX.Y.Z` (annotated) — the git-describe anchor and droplet deploy target. The old `deploy-vN` deploy tags are retired.
