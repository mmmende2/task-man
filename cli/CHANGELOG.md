# task-man

## 0.5.0

### Minor Changes

- 5e94fb7: Adopt Changesets for versioning. `cli` and `web` share one fixed version, bumped from a changeset per PR with an auto-generated `CHANGELOG.md`. Releases are cut with `changeset version` and tagged `vX.Y.Z` (annotated) — the git-describe anchor and droplet deploy target. The old `deploy-vN` deploy tags are retired.
