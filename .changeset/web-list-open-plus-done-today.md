---
"task-man": patch
"task-man-web": patch
---

**Web:** Focus and Backlog fetch only what they show.

They used to download every task ever, including ~1,000 old done tasks they
immediately discarded (86% of the payload). `GET /api/tasks` now accepts
`done_since=<ISO instant>`: it drops done tasks completed before that instant
but keeps open tasks, tasks completed since, and subtasks of any kept task (so
progress on an open parent still counts its old done subtasks). The views send
the start of the user's local day. On the production store that is 564 KB ->
110 KB raw (87 KB -> 17.5 KB gzipped). An explicit `status` filter overrides it.
