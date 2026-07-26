---
"task-man": patch
---

Fix the release image stamping itself with the *previous* release, and colour the TUI's build token.

**The stamp.** `/healthz` on the v0.6.0 deploy reported `build: v0.5.1-5-g939826d`. This was previously blamed on the GHA layer cache (and #50's `no-cache-filters: runtime` was added for it) but that was not the cause. The publish workflow's two runs for the same release commit disagreed: the merge-to-main run computed `v0.6.0-0-g939826d` correctly, while the **tag** run — the one that publishes `:v0.6.0`, the image you actually deploy — computed `v0.5.1-5-g939826d`.

`actions/checkout` resolves a tag push by force-fetching the triggering SHA straight into the tag ref:

```
git fetch --no-tags origin +939826d…:refs/tags/v0.6.0
```

That replaces the **annotated** tag object with a **lightweight** one. A bare `git describe` only considers annotated tags, so it skipped v0.6.0 and walked back to the previous release. Every `git describe` in the repo now passes `--tags` (count lightweight tags) and `--match 'v[0-9]*'` (ignore stray non-release tags, which could otherwise become the anchor outright) — publish.yml, ci.yml, the TUI's own resolver, the Dockerfile comment and the deploy docs.

A new `verify the release stamp` step fails the publish loudly if a `vX.Y.Z` tag build's describe isn't anchored to `vX.Y.Z-0-g<sha>`, or if `cli/package.json` disagrees with the tag — so a mis-stamped release is a red build, not a wrong image. `no-cache-filters: runtime` is kept: the cache hazard is real and separate, just not what caused this.

**The colour.** The TUI footer now paints the build token yellow when it's present, so a non-release build catches the eye. A clean release has no token at all and stays entirely grey.
