# task-man

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
