# Sync, push, and local-cache plan (parked design)

Status: **proposal, not started.** Written 2026-11-15 after the bandwidth
investigation. Nothing here is built; the quick wins that preceded it are in
PR #67 and #68.

## 1. Why this exists

The droplet sent **131 GB outbound in October 2026** (plan allowance: 1000 GB).
Cause: every client polls the *entire* task list.

| Fact (production store, 2026-11-15) | Value |
|---|---|
| Tasks | 1,217 (1,042 done, 175 open, 5 done today) |
| Full list as JSON | 564 KB raw / 87 KB gzipped (~464 B per task) |
| Open + done-today | 110 KB raw / 17.5 KB gzipped |
| Web poll (before #67) | every 2 s, whole list, no compression, foreground tabs only |
| TUI poll (remote mode) | every 2 s, whole list, never pauses |
| One web tab, before | ~2.3 Mb/s (~26 GB/day), matches the plateaus on the droplet's bandwidth graph |

The list grows forever (nothing archives done tasks), so the cost of "send
everything" grows with age, not with activity.

## 2. What the quick wins already change

- **#67**: web polls every 10 s; `/api/*` is gzipped; GETs carry an `ETag` and
  `Cache-Control: private, no-cache`; `RemoteStore.load()` revalidates with
  `If-None-Match` and reuses its body on `304`. An idle poll is now a few hundred
  bytes, at any interval.
- **#68**: Focus/Backlog request `done_since=<local midnight>` and receive only
  what they render (110 KB instead of 564 KB).

After those, idle cost is ~0 and a *changed* poll costs ~17 KB (web) or ~87 KB
(TUI, which still needs the full list). That is already ~100x lower. The design
below is about the remaining things polling can't give us: **latency** (up to one
poll interval before an MCP write shows up) and **cost that scales with list
size** on every change.

## 3. Goals and non-goals

Goals
- A write from any surface (MCP, TUI, web, phone) appears on the others within
  about a second.
- Cost per change is proportional to *what changed*, not to the list size.
- Keep the property Mario values: watch MCP-created tasks appear live in the
  terminal or browser.
- Snappy first paint and tolerance of a flaky connection (the critical review's
  "offline-tolerant remote TUI" item, `docs/critical-review-2026-07.md` section 5).

Non-goals
- Multi-user collaboration, CRDTs, or real conflict resolution. One user plus
  Claude plus a phone; last-writer-wins per field is fine.
- Replacing `tasks.json`. At ~1,200 tasks a database buys nothing yet (see
  section 7).

## 4. Proposed design, in phases

Each phase ships independently and leaves the app working.

### Phase A: a revision counter and delta reads
- The server keeps a monotonically increasing integer `rev`, bumped on every
  write (add / update / remove / insertAt).
- `GET /api/tasks?since=<rev>` returns `{ rev, changed: Task[], deleted: string[] }`.
  No `since` returns a snapshot `{ rev, tasks }`. Both include the current `rev`
  in an `X-Rev` header, so a client can tell "nothing changed" without a body.
- **Deletions need tombstones.** `task_delete` is a hard delete today. Keep a
  small `{ id, rev }` log of removals (say 30 days or the last N entries). A
  client whose `since` is older than the oldest tombstone gets a snapshot.
- Use the counter, **not** `updated_at`: timestamps break under clock skew and
  same-millisecond writes.
- `tasks.json` is documented as hand-editable/rsync-able (`PRD.md`). Persist
  `rev` next to the data (a sidecar file or a header field) and fall back to a
  content hash or mtime check on startup so an out-of-band edit bumps it.

### Phase B: push with Server-Sent Events
- `GET /api/events` streams `event: rev` / `data: <n>` whenever `rev` changes,
  plus a comment heartbeat every ~25 s.
- Clients keep today's poll as a slow fallback (60 s) and, on each event, make
  a Phase A delta request. The event itself is tiny; the data still goes through
  the normal authenticated API.
- All writers already go through the one server process, so the server emits
  the event itself; no pub/sub infrastructure.
- Why SSE and not WebSockets: traffic is one-way, SSE is plain HTTP (works
  through Cloudflare and cloudflared, auto-reconnects, sends `Last-Event-ID`),
  and the client sends its writes as ordinary POSTs it already has.

### Phase C: local caches on the clients
- **Web:** IndexedDB holds the last snapshot plus `rev`; first paint is instant
  from cache, then a delta catches up. Writes apply optimistically and reconcile
  on the next delta.
- **TUI:** a cache file (e.g. `~/.task-man/cache.json`) with the same shape, so
  a remote TUI starts instantly and shows a "stale" banner when offline.
- **Writes while offline:** an append-only queue replayed in order on reconnect.
  `Idempotency-Key` already exists on the store routes, so replays are safe.
- Conflict rule: per-field last-writer-wins by server order. Good enough for one
  user; revisit only if shared lists ever happen.

### Phase D (only if it earns it): archival and SQLite
`docs/critical-review-2026-07.md` suggests designing long-range metrics, archival
and SQLite together as one migration. Not needed for bandwidth; the trigger would
be tens of thousands of tasks or wanting history queries.

## 5. Constraints and risks to check before building

- **Cloudflare Tunnel and Access with a long-lived stream.** SSE normally works
  through the tunnel, but idle timeouts require the heartbeat, and the Access
  session/JWT expires while a stream is open. Prototype on the real droplet
  first: how does the stream behave when the Access token expires?
- **Auth on the stream.** Browsers' `EventSource` can't set headers; same-origin
  cookies from Access cover the web, but the TUI uses a JWT header, so the TUI
  needs `fetch` streaming rather than `EventSource`.
- **1 GB droplet.** Each open stream is a held connection. A handful is nothing;
  cap and log it.
- **Tombstone horizon vs. a TUI left closed for weeks:** falls back to a snapshot.
- **Thundering herd:** after a deploy restart every client reconnects at once.
  Add jitter to reconnects.
- **Rev integrity:** if `rev` ever goes backwards (restore from backup), clients
  must resnapshot. Include a server epoch id in `X-Rev` so a mismatch forces it.

## 6. Success criteria and how to measure

- Droplet *Insights > Bandwidth* (public outbound) on the 14-day view: flat near
  zero with small bumps on actual use.
- `docker stats --no-stream`: task-man NET I/O grows by MBs per day, not GBs.
- A task created via MCP appears in an open web tab and TUI in about a second.
- The October-style multi-hour 2.4 Mb/s plateaus do not recur.

## 7. Alternatives considered

- **Just poll slower.** Cheap, already done at 10 s, but latency worsens and the
  per-change cost is still the whole list.
- **WebSockets.** More moving parts than SSE for a one-way signal.
- **SQLite now.** Doesn't reduce what crosses the wire; the delta protocol does.
- **CRDT/offline-first sync libraries.** Heavy for one user; revisit only with
  collaboration.

## 8. Open questions for Mario

1. Is ~1 s freshness the target, or is "within 10 s" enough once #67/#68 land?
   (If enough, Phases B and C can wait.)
2. How much does offline/flaky-network use matter day to day? That decides
   whether Phase C is worth building before B.
3. Should deletes stay permanent, or become soft deletes with a trash (the
   critical review's undo/trash suggestion)? It would double as the tombstone log.
4. Does the TUI keep working against an *older* server during a rolling deploy?
   (Phase A should be additive: old `/api/store/tasks` stays.)

## 9. Suggested order

#67 and #68 (done) -> measure for a week -> Phase A + a prototype of B on the
droplet to settle the Cloudflare questions -> Phase C only if offline use
matters.
