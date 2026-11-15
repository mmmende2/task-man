# task-man-web

## 0.9.0

### Patch Changes

- 1266ea6: **Web + server:** cut the droplet's outbound bandwidth.

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

- 56306b7: **Web:** Focus and Backlog fetch only what they show.

  They used to download every task ever, including ~1,000 old done tasks they
  immediately discarded (86% of the payload). `GET /api/tasks` now accepts
  `done_since=<ISO instant>`: it drops done tasks completed before that instant
  but keeps open tasks, tasks completed since, and subtasks of any kept task (so
  progress on an open parent still counts its old done subtasks). The views send
  the start of the user's local day. On the production store that is 564 KB ->
  110 KB raw (87 KB -> 17.5 KB gzipped). An explicit `status` filter overrides it.

- Updated dependencies [427b6b4]
- Updated dependencies [cc7028b]
- Updated dependencies [3311ada]
- Updated dependencies [1266ea6]
- Updated dependencies [56306b7]
  - task-man@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [8904220]
  - task-man@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [9d297f3]
  - task-man@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [1e25189]
- Updated dependencies [fbd8717]
- Updated dependencies [fbd8717]
- Updated dependencies [fbd8717]
- Updated dependencies [fbd8717]
- Updated dependencies [0c44ad7]
  - task-man@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [318ca04]
  - task-man@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies [79ae52f]
- Updated dependencies [551b8ea]
  - task-man@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies [5e94fb7]
  - task-man@0.5.0
