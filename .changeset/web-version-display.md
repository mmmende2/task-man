---
"task-man": patch
---

Web: the nav menu and Status page now show the deployed **version** (from package.json) plus the short commit hash — e.g. `v0.6.0 · 939826d` — instead of the raw git-describe build stamp. The describe stamp's tag anchor can lag a release (a CI build-cache artifact that made a 0.6.0 deploy read misleadingly as `v0.5.1-5-g939826d`); the package version is compiled in and always correct, so it leads, with the commit hash kept for pinning the exact build.
