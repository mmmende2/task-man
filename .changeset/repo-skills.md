---
---

Repo tooling, no runtime change: add `changeset` and `release` skills under `.claude/skills/`, which ships with the repo. The changeset skill covers frontmatter (always `task-man`, never `task-man-web`), bump levels including what counts as a breaking change, and the changelog brevity budgets. The release skill covers the version-bump → release PR → annotated tag → publish-watch flow, and keeps the droplet deploy as operator-run instructions rather than something Claude executes.
