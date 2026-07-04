# Critical Review — July 2026

A three-lens review (product, architecture, security/scalability) of task-man as it
stands post-Phase-1: async `Store` abstraction landed, PIN auth removed, remote mode
built but not yet deployed. Companion doc: [`system-map.md`](./system-map.md) for the
terse "how it connects" reference.

**Verdict up front**: the tool achieves its stated goal — a keystroke-fast, ADHD-informed
task manager where human and AI write to the same list — and the codebase (~10k LOC,
18 test files) is small enough to stay fully comprehensible, which is itself a design
win. The two things that most need attention before public exposure: **the server
currently binds `0.0.0.0` with no auth at all** (a regression window created by
removing PIN before Cloudflare Access exists), and **the origin never verifies
identity itself** (all trust delegated to the tunnel). Both are cheap to fix.

---

## 1. Product perspective

### What it gets right

- **The differentiator is real.** "Claude and I share one task list, with attribution"
  is not a feature other task managers have. `created_by` + `session_id` + per-session
  color tinting + the human/Claude split in metrics and end-of-day reports make AI
  collaboration *visible* rather than bolted on. This is the moat; everything else
  (vim keys, outrun palette) is table stakes done well.
- **The working-day loop is a genuine product spine.** Plan → Focus → Write → Refine →
  Metrics maps to actual hours of a day, and each mode answers one question. Most
  task tools are a database with views; this is a *routine* with screens. The PRD's
  "one keystroke, one outcome" and "focused vs. backlog is a state, not a view"
  principles are consistently executed in the code.
- **ADHD-informed is load-bearing, not branding.** Shame-free message pools,
  deterministic day-stable encouragement, no streak-loss framing, the Refine mode
  card-flip (one decision at a time = low executive-function tax), focus soft-cap
  that asks instead of blocks. The research docs are thin evidence-wise, but the
  *implementation choices they drove* are sound UX regardless.
- **Capture friction is genuinely near zero.** `task-man add`, Write mode flag
  syntax, `: subtask` prefix, MCP `task_add`, web Quick Capture — every surface has
  a ≤5-second capture path. For the ADHD stance this is the single most important
  property and it's well covered.

### Product gaps, in priority order

1. **No time dimension at all.** No due dates, no reminders, no recurrence. For a
   tool whose PRD names *time blindness* as a design target, this is the striking
   omission — the tool defends attention but not time. Every routine task (dishes,
   invoices, standing reviews) must be re-entered by hand, and nothing can say
   "this is due Friday." Phase 6 lists these; I'd argue they're mis-tiered (see §6).
2. **Remote mode threatens the "instant" principle.** Principle #6 says "if a
   feature needs a loading state, we reconsider the feature" — but remote mode makes
   *every* read a full task-list fetch over HTTPS through Cloudflare. On a good
   connection this is ~50–150ms (fine); on cellular/hotel wifi it's a visible stall,
   and the TUI currently renders empty-then-populated. There is no local cache, no
   optimistic update, no offline queue. This is acceptable for v1 of remote, but it's
   the first place daily use will grate.
3. **Destructive actions have uneven safety nets.** TUI has `u` undo; web and MCP
   have nothing. `task_delete` (Claude-invocable) is permanent and leaves subtasks
   dangling by design. One bad model call can silently orphan a task tree. A trash
   state (`deleted_at`, filtered everywhere, purged after 30 days) would cover all
   three surfaces for little cost and make `confirm: true` actually mean something.
4. **Metrics honesty erodes as history grows.** Insights like streak/velocity read
   the whole task list forever; there's no archival, so either the file grows
   unbounded (fine for years, but see scalability) or a future cleanup silently
   breaks "personal best." Worth deciding *now* whether history is a first-class
   promise, because it changes the storage answer.
5. **Doc drift is bad enough to mislead.** `cli/README.md`, `web/README.md`, and
   `mcp/README.md` all still document the PIN/`--set-pin`/login-screen era and
   "MCP: no HTTP in between"; `architecture.md` describes the deleted `web/dist` copy
   step; the PRD and web README say web = Focus + Capture but the SPA ships four
   pages (Focus/Capture/Backlog/Metrics). For a solo project docs are the memory —
   right now they'd actively mislead future-you (or future-Claude).

---

## 2. Architecture perspective

(Connection map lives in [`system-map.md`](./system-map.md).)

### Strengths

- **The pure-function core is the best structural decision in the repo.**
  `task-filters.ts` (filter/resolve/date predicates, zero I/O) is shared by
  `TaskStore`, `RemoteStore`, reports, and insights. It's what made the remote
  refactor tractable and what keeps local/remote behavior provably identical.
- **`Store` as the single seam.** One async interface; TUI, MCP, and handlers are
  all written against it and genuinely don't know which backend they're on. The
  factory (`get-store.ts`) is 10 lines. This is the textbook version of the pattern,
  without ceremony.
- **The two API dialects are justified, not accidental.** `/api/store/*` passes
  input through faithfully (so MCP attribution survives the HTTP hop);
  `/api/tasks*` is the web's convenience surface that pins `created_by: human`.
  The comment in `routes.ts` explaining *why* is exactly the kind of comment that
  should exist. Collapsing them would reintroduce the attribution bug.
- **Failure handling in `RemoteStore` is thought through**: one retry for network,
  one for auth-with-forced-refresh, idempotency keys generated per-operation (not
  per-attempt) so replays dedupe server-side. Most personal projects don't get this
  right; this one did.
- **Writes are safe at the file level**: proper-lockfile around read-modify-write,
  atomic tmp-rename, stale-lock timeout. Single-writer correctness is solid.

### Shortcomings

1. **No API input validation.** `routes.ts` casts request-body fields `as never` /
   `as string` and `/api/store/update` passes arbitrary `changes` straight into
   `Object.assign` on the task. A malformed or malicious POST can write junk fields,
   clobber `created_at`, or set `status: "banana"` — and that junk persists in
   `tasks.json` and flows to every client. Zod is *already a dependency* (mcp/) and
   the MCP tools validate properly; the HTTP boundary validates nothing. This is the
   biggest code-level gap, and it's doubly important because `/api/store/*` is about
   to be internet-reachable.
2. **Last-writer-wins with no concurrency control above the file.** The lock
   serializes writes, but two clients doing read → edit → update on the same task
   silently clobber each other's fields (`update` is a field-level merge with no
   version check). Solo: fine. The moment a second person or a second *device* edits
   concurrently, edits will occasionally vanish with no error. Cheap fix when
   needed: `updated_at` as a precondition (reject if stale, client refetches).
3. **`RemoteStore.query()` fetches everything and filters client-side.** Honest and
   simple, and correct at this scale — but it means the server's nice filtered
   endpoints (`/api/tasks?scope=…`) exist and the remote TUI doesn't use them. Fine
   for now; noted as the first thing to change if payloads ever matter.
4. **Prefix resolution over HTTP is a TOCTOU.** `resolveId` fetches the list, picks
   a match, then `update` re-resolves server-side. Between the two, the winner can
   change. Consequence at personal scale: effectively zero. Worth knowing about.
5. **Insights state doesn't follow the store.** `insights-log.json` (dedupe of the
   daily insight) is always local, even in remote mode — two machines will pick
   different daily insights and occasionally repeat types. Cosmetic, but it breaks
   the "single source of truth" story. Either move it server-side (a
   `/api/insights-log` blob) or accept and document it.
6. **Three package-locks and a `file:` snapshot dependency instead of workspaces.**
   The build-order constraint (cli before web/mcp) is real, undocumented outside the
   Dockerfile comment, and has already caused friction ("rebuild cli when shared
   modules change"). npm workspaces would eliminate the snapshot problem and the
   triple `npm install`. Not urgent; do it the next time the seam causes a bug.

### Is there a better arrangement?

Mostly no — for one user and three thin clients, this is close to the right shape,
and notably it has *avoided* the classic over-engineering traps (no GraphQL, no ORM,
no message bus). Two structural changes I *would* make, in order:

1. **Put validation + a version check at the HTTP boundary** (zod schemas shared
   from `cli/src/types.ts`, `updated_at` precondition on update). This turns the
   server from "a pipe to the file" into "the thing that guards the invariants,"
   which is what a single source of truth is supposed to be.
2. **Decide the SQLite question by trigger, not by mood.** The JSON file is
   correct today. Define the tripwires now (any of: >2 humans, file >2 MB, need for
   per-user visibility, need for an audit trail) and migrate when one fires. The
   `Store` interface means the migration touches one class.

What's missing that should exist even at this scale: a **`task-man doctor`**-style
self-check (config valid? server reachable? auth works? backup recent?) — remote
mode multiplies the ways the tool can be half-broken, and right now diagnosis is
"read the error and grep the source."

---

## 3. Security perspective

Threat model as stated: internet-exposed, primarily Mario, possibly a few trusted
colleagues later. No hostile-insider concerns, but internet-facing means drive-by
scanning and credential mistakes are in scope.

### Findings, ordered by severity

1. **[Fix before anything else] Unauthenticated server defaults to `0.0.0.0`.**
   PIN auth was removed in Phase 1 (correctly, per the plan) but
   `DEFAULT_SERVER_BIND` is still `0.0.0.0` — today, `task-man serve` exposes the
   full read/write API, including `/api/store/*` primitives, to any device on the
   LAN with zero auth. The PIN era at least had a rate-limited gate. Until the
   Cloudflare deployment exists, the default should be `127.0.0.1`, with `0.0.0.0`
   requiring an explicit flag (the flag's help text already says this — the default
   just doesn't match it). One-line fix in `constants.ts`.
2. **[Fix before colleagues] The origin trusts the network, not identities.**
   The droplet design (no inbound ports, tunnel-only ingress) is good, but the app
   itself never verifies anything — anyone who can reach `task-man:3030` (another
   container on the docker network, a future misconfigured `ports:` line, a
   compromised cloudflared) has full access. Cloudflare sends a signed
   `Cf-Access-Jwt-Assertion` header on every request; validating it (JWKS fetch +
   audience check, ~40 lines of Hono middleware, off by default locally) converts
   "the tunnel is the perimeter" into defense-in-depth and — importantly — gives the
   app the caller's *email*, which is the prerequisite for any future multi-user or
   audit feature.
3. **Non-expiring service token stored plaintext in `config.json`.** The MCP path
   puts `service_token_id/secret` (and the Resend API key) in a world-readable-by-
   default JSON file. Cheap hardening: `chmod 600` on write in `saveConfig()`, plus
   support `CF_ACCESS_CLIENT_ID/SECRET` env vars as an alternative so the secret can
   live in a keychain-backed shell env instead. Also: pick a rotation habit
   (Cloudflare service tokens can be rolled without downtime — do it when a laptop
   is lost, at minimum).
4. **No authorization layer at all — Access is authentication only.** Every
   authenticated identity sees and can mutate *everything*, including personal-scope
   tasks. "A few colleagues" under the current model means colleagues read your
   personal task list and can delete anything. This is fine to defer, but be clear
   that inviting anyone requires either (a) per-user task ownership + filtering
   (real work, wants SQLite) or (b) a separate deployment per person (zero work,
   often the right answer for a personal tool).
5. **Input validation** — same finding as architecture §2.1; it's also a security
   issue because `/api/store/update` accepts arbitrary field writes from any
   authenticated caller.
6. **Adequate as-is, noting for completeness:** CSRF is effectively covered
   (JSON content-type forces preflight; no CORS headers are emitted, so cross-origin
   browsers are blocked); the SPA has no secrets; idempotency cache is in-memory and
   unauthenticated-key-guessable but at worst replays a cached response to an
   authenticated caller; `cloudflared access token` shells out with a config-supplied
   URL via `execFile` (array args, no shell interpolation — fine).

### Scalability (brief, because the honest answer is "not a problem")

- **The JSON file**: every write rewrites the whole file under a lock; every remote
  read ships the whole list. At 1,000 tasks that's ~300 KB — trivial. At 10,000
  (years of use, no archival) it's a few MB per poll, which starts to matter on
  cellular before it matters on the server. The scaling wall is *concurrent
  writers* (lock contention + last-writer-wins), and that wall is exactly the
  multi-user line. One user + Claude + a phone: no issue for years.
- **The droplet**: a $6 instance runs this workload at <1% utilization. cloudflared
  + node ≈ 150 MB RAM. Nothing to do.
- **Polling**: TUI (2s) + web (foreground-only, pauses on hidden — nicely done) at
  single-digit users is noise. If it ever isn't, the answer is SSE on the server
  pushing "tasks changed," not faster polling.

---

## 4. Oversights (consolidated)

| # | Oversight | Severity | Cost to fix |
|---|---|---|---|
| 1 | `serve` binds `0.0.0.0` unauthenticated post-PIN-removal | High (today) | 1 line |
| 2 | No origin-side CF JWT verification | High (at deploy) | ~40 lines |
| 3 | No schema validation at HTTP boundary | Medium-high | ~1 day, zod exists |
| 4 | Secrets plaintext, no `chmod 600`, no env-var path | Medium | ~1 hr |
| 5 | READMEs/architecture.md describe the pre-Phase-1 system | Medium (misleads) | ~1 hr |
| 6 | No trash/soft-delete; MCP delete orphans subtasks | Medium | ~half day |
| 7 | Last-writer-wins on concurrent update | Low now, high with users | small |
| 8 | `insights-log.json` diverges across machines in remote mode | Low | small |
| 9 | No backup *restore* verification path (`task-man doctor`?) | Low | half day |

## 5. Next steps

**Logical (do before/during Phase 2 deploy):**
1. Flip default bind to `127.0.0.1` (oversight 1) — do this today.
2. Update the three stale READMEs + `architecture.md` (or fold the latter into
   `system-map.md` and delete it).
3. Zod-validate route inputs; share schemas with MCP.
4. Add CF Access JWT middleware (env-gated: on when `CF_ACCESS_TEAM_DOMAIN` set).
5. Execute Phase 2 per `phase2-manual-setup-guide.md`; run the full §6 checklist.

**Big picture (choose deliberately, not by drift):**
- **The multi-user fork in the road.** Everything from storage (SQLite) to authz to
  concurrency control hangs on whether "a few colleagues" means *shared data* or
  *their own instances*. Separate instances cost nothing and preserve every current
  simplification. I'd default to that until a concrete shared-list need appears.
- **History as a promise.** If long-range metrics matter, design archival +
  SQLite together (one migration, not two).
- **Offline-tolerant remote TUI** (cache last-known list, queue writes, replay) —
  the biggest daily-QoL architecture item once remote mode is the default.

## 6. Two feature picks

### Pick 1 — Recurrence + due dates ("externalize time")

The highest-leverage gap. ADHD design targets time blindness, and the tool currently
has zero time features; meanwhile every genuinely recurring chore pollutes either
the backlog (stale) or your memory (the thing the tool exists to replace).

Sketch, scoped to fit the existing model:
- `due_at: string | null` and `recur: { every: 'day'|'week'|'month'; on?: … } | null`
  on Task. Two fields, no new objects.
- Completion of a recurring task immediately re-creates it `todo` with the next
  `due_at` (materialized instances — dumb and debuggable, vs. virtual occurrences).
- Surfacing, in keeping with "focus over clutter": due-today/overdue tasks get a
  quiet marker in Focus/Plan and an auto-suggestion in the Refine queue — **not**
  notifications, **not** red badges. The end-of-day report gains a "due tomorrow" line.
- Refine mode asks "When is this due?" as one more card question — the metadata
  collection machine already exists.
- MCP: `task_add`/`task_update` accept both fields → Claude can say "I set that to
  recur weekly" — and `task_list` gains `due: today|overdue|week`.

### Pick 2 — AI morning planning (`/plan-day`) — deepen the moat

The PRD's Phase 3 vision ("AI-assisted prioritization") is half-built:
`task_prioritize` returns context but nothing drives a *routine* around it. The
product's spine is the working day; the AI should participate in the day's *setup*,
not just task CRUD.

Sketch:
- A `task_plan_day` MCP tool + a `/plan-day` Claude Code skill: Claude pulls stats,
  the refine queue, yesterday's report, and the backlog; proposes ≤3 focus picks
  *with reasons grounded in `time_estimate`/`vibe`/staleness* ("two `dread` tasks
  rotted a week — pick one, pair it with a `love` task"); on approval, calls
  `task_focus`/`task_update`. Proposal → approval, never auto-apply — same contract
  as `task_prioritize`.
- The same skill run at 5pm inverts into standup prep (drafts tomorrow's focus from
  today's leftovers), which also knocks out the PRD's "natural-language standup"
  checkbox.
- Zero schema changes; it's orchestration of tools that already exist. It's also
  the feature that makes the `vibe`/`time_estimate` metadata — which Refine mode
  works hard to collect — actually *pay rent*.

If forced to choose one: Pick 1. It fixes a daily pain with or without AI in the
loop; Pick 2 makes an already-good loop delightful.
