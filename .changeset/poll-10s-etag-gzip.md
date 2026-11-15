---
"task-man": patch
"task-man-web": patch
---

**Web + server:** cut the droplet's outbound bandwidth.

The Focus and Backlog views re-downloaded the entire task list (~700 KB of
uncompressed JSON) every 2 seconds. One open tab was ~2.4 Mb/s, ~26 GB/day, and
the droplet sent 131 GB last month.

- The task views now poll every 10 seconds (`TASK_POLL_MS`).
- `/api/*` responses are gzip-compressed (`hono/compress`).
- `/api/*` GETs carry an `ETag` and `Cache-Control: private, no-cache`, so an
  unchanged list is a body-less `304` that the browser revalidates for free.
- The remote TUI (`RemoteStore.load()`) now revalidates with `If-None-Match` and
  reuses its cached list on a `304`, so its 2 s poll costs a few hundred bytes
  when nothing changed while still showing MCP/web writes within 2 s.
