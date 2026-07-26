---
---

CI: publish.yml no longer serves the Docker `runtime` stage from the gha cache, so the git-describe stamp baked into a release image reflects that build (fixes a `vX.Y.Z` image inheriting main's pre-tag `vPREV-N-g…` stamp).
