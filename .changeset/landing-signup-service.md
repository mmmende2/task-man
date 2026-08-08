---
---

Add the `landing` workspace: a public landing page + approval-gated signup
service (docs/landing-signup-plan.md), published as a second image
(`ghcr.io/mmmende2/task-man-landing`) and deployed alongside `task-man` on the
droplet. No change to `task-man`/`task-man-web` — `landing` isn't part of the
changesets fixed group and doesn't touch `cli/` or `web/`.
