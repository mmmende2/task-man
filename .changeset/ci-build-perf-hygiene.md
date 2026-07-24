---
---

CI/build hygiene, no runtime change: add a root `.dockerignore` (KB-scale build context), switch the CI docker job to buildx with a GitHub Actions layer cache, fix the build-arg mismatch (`GIT_SHA` → `GIT_DESCRIBE`), least-privilege `permissions` + per-branch `concurrency` + job timeouts, quiet the image `npm ci` layers (`--no-audit --no-fund`), and pin `web` to `engines.node >=22`.
