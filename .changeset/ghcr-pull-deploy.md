---
---

Deploy infra, no runtime change: publish the image to GHCR on every merge to main (`publish.yml`) and switch the droplet to a **pull-based** deploy (`docker compose pull && up -d`) instead of building on the 1GB box. Adds a `docker-compose.build.yml` escape hatch for emergency on-box builds and rewrites the deploy runbook (pull, `TASK_MAN_TAG` pinning/rollback).
