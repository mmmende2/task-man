---
---

Deploy: make `TASK_MAN_TAG` required in `deploy/docker-compose.yml` (`${TASK_MAN_TAG:?...}`, no default) so a bare `up -d` can't silently ship "whatever latest is" — every deploy names its version. Update the deploy docs (`release-deploy-quickstart.md`, `phase2-manual-setup-guide.md`) to the pull-based flow and the now-required tag.
