---
"task-man": patch
---

The TUI footer version now tells you when you're running code that isn't the release. `VERSION` comes from `package.json`, which Changesets only bumps at release time — so on a feature branch whose changesets haven't been consumed, the footer confidently displayed the *previous* release (e.g. `v0.6.0` while running four commits past it). The footer now resolves `git describe` at startup and appends a suffix whenever the running code differs from the release tag:

- `v0.6.0` — sitting exactly on the release tag, clean tree
- `v0.6.0 · +3 fd86c26` — three commits past v0.6.0
- `v0.6.0 · +3 fd86c26*` — ...with uncommitted changes (trailing `*`)

The label still leads with the compiled `VERSION` rather than the raw describe string, mirroring web's `formatVersionLabel`: a describe tag anchor can lag the real release, so `v0.5.1-5-g939826d` would misleadingly read as 0.5.1 on a 0.6.0 build.

Resolution order: the `TASK_MAN_BUILD` stamp (injected into the Docker image, which has no `.git`) wins; otherwise it shells out to `git describe` in the module's own directory. It's skipped entirely for an installed copy (path under `node_modules`), where git would either fail or silently describe whatever unrelated repo the install happens to sit inside. Any failure falls back to the bare version — resolved once at module load, since the footer re-renders on every pulse tick.

`--version`, the MCP server version, and `whoami`'s `client_version` are unchanged: those are semver contracts, not display surfaces.
