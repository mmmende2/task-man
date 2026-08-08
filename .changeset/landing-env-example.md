---
---

Deploy: `deploy/.env.example` now carries the `landing` service's variables.

The landing service added ten environment variables to
`deploy/docker-compose.yml` but not to the template three docs point operators
at, so a first deploy surfaced them as ten "variable is not set" warnings
instead of a checklist. Each group is annotated with what happens when it is
left blank, and which one is mandatory.
