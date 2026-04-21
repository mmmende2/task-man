# Plan — LAN peer sync for task-man

## Context

Task-man currently stores everything in a single JSON file at `~/.task-man/tasks.json` on a single machine. The user works from two laptops — a work machine used during the day and a personal machine used at night — and those machines only share a network at home in the evenings. Today there is no way for work done on one to show up on the other.

The user wants a sync story that sits between "local only" and "host something on the open internet." The natural fit for his pattern is **peer-to-peer sync on the LAN**: both machines operate independently on their own local stores, and when they happen to be on the same network (at home in the evening), they discover each other and reconcile. No always-on machine, no public hosting, no git.

This plan also keeps Tailscale as a clean follow-up: the discovery layer is pluggable, so "on the tailnet" is the same protocol with a different reachability check.

## Goals and non-goals

**Goals.**
- Two (or more) task-man installs converge to the same state when they meet on a network.
- Divergence between syncs is fine. A task created on machine A while offline appears on machine B after the next sync.
- The existing CLI, TUI, and MCP surface keep working unchanged against the local JSON store. Sync is additive.
- Deletions propagate (tombstones), not just creations/edits.
- Safe by default: backups before merge, summary of what changed, secret required so a random device on the coffee-shop wifi can't clobber your tasks.

**Non-goals for v1.**
- No always-on authority machine, no hosted backend, no SQLite migration.
- No git layer (the user explicitly rejected this in the last question).
- No real-time co-editing. Sync is episodic — triggered manually, on TUI launch/close, or by the daemon on peer discovery.
- No multi-way conflict UI. LWW (last-writer-wins by `updated_at`) is the rule; ties are broken deterministically.
- Tailscale support is out of scope for v1 but the architecture leaves it as a one-file addition.

## Architecture

### The local store stays authoritative locally

`TaskStore` (`cli/src/store.ts:8`) continues to be the only thing the TUI, CLI, and MCP server talk to. Sync runs alongside it, never in the hot path of a user keystroke. A sync session reads the local store, fetches the peer's snapshot, computes a merged list, and writes the merged list back through `TaskStore` (going through the normal `withLock` + atomic-rename path).

### Three new pieces

1. **Merge engine** — pure function that takes two `Task[]` and returns the merged `Task[]` plus a diff summary. No I/O.
2. **Peer discovery + transport** — advertises this install on mDNS, discovers peers, exchanges snapshots over a tiny HTTP endpoint secured by a shared secret.
3. **Sync orchestration** — the glue: when to trigger sync, how to present what changed, how to back up before writing.

### Data model changes

Two new concepts are needed on `Task` (`cli/src/types.ts:8`):

- **Tombstones.** Today `TaskStore.remove()` (`cli/src/store.ts:158`) hard-deletes. That can't survive sync — a peer with a stale copy would resurrect deleted tasks. Change `remove()` to soft-delete by setting a new optional `deleted_at: string | null` field and leaving the task in the array. The TUI/CLI/query paths already live in `TaskStore.query` and `load`; filter out tombstoned tasks there. An occasional background compaction (e.g. anything tombstoned more than 30 days ago) can prune for real.
- **Device of last edit (optional, tiebreaker only).** Add `updated_by_device: string | null`. Not shown in UI; used only to break ties when two devices edit the same task in the same ISO-second.

Also new at the config level (`cli/src/types.ts:50` `TaskManConfig`):

- `sync.device_id` — stable UUID per install, generated on first sync.
- `sync.secret` — shared across paired devices; required by the HTTP endpoint. User runs `task-man sync pair` once on each machine with the same value, or lets the first machine print one and copy it.
- `sync.service_name` — human-readable name (e.g. "Work MBP") for the peer picker.
- `sync.last_synced_at` — informational.

Existing JSON stores on disk predate these fields. The load path in `TaskStore.load` already tolerates missing fields (see `time_estimate` / `vibe` defaulting at `cli/src/store.ts:25`). Extend that with defaults for `deleted_at` (null) and `updated_by_device` (null). No migration script needed.

### The merge engine

A pure function, easy to unit-test:

```
merge(localTasks, peerTasks, localDeviceId, peerDeviceId) -> { merged, summary }
```

Rules, in order:

1. **Group by `id`.** Pair each task with its counterpart on the other side.
2. **Only on one side → include.** New tasks from either machine carry over.
3. **On both sides → pick the one with the later `updated_at`.** This handles edits, status changes, focus toggles, category changes — the whole surface — because every mutation in `TaskStore.update` already stamps `updated_at` (`cli/src/store.ts:106`).
4. **Tombstones.** If one side has `deleted_at` set, treat `deleted_at` as a form of `updated_at` for comparison. Deletion wins iff its timestamp is newer than the other side's `updated_at`. (An edit after a delete on the other machine un-deletes, which is what you want — the user actively brought it back.)
5. **Tie on `updated_at`.** Pick the task whose `updated_by_device` sorts first. Fully deterministic, no human involvement.
6. **Parent integrity.** After merge, any task whose `parent_id` points to a tombstoned parent keeps its `parent_id` but the UI already treats orphaned subtasks as top-level (worth verifying — see "Verification" below). No rewrite pass needed in v1.

The summary returned alongside `merged` has counts — `{added, updated, deleted, unchanged}` — and a short list of titles for added/deleted, so we can print something like `+3 added, 1 deleted, 2 updated` after sync.

### Transport and discovery

- **mDNS** via `bonjour-service` (small, zero-dep). Advertises `_task-man._tcp.local` with a TXT record carrying `device_id` and `service_name`. Each install starts advertising when the daemon/TUI runs and stops on exit.
- **HTTP server** on an ephemeral port, one route: `POST /sync`. Body is `{ secret, device_id, snapshot: Task[] }`. Response is `{ snapshot: Task[] }`. Both sides compute the merge locally against their own store; they don't trust the peer's merge.
- **Shared secret.** Missing or wrong secret → 401. Prevents accidental pairing with a stranger's laptop on a conference wifi.
- **TLS is out of scope.** This is loopback-ish traffic on personal networks; the secret is the gate. The plan explicitly accepts that a malicious co-resident of your LAN who already has your secret is not the threat model.

Everything transport-related lives in a new `cli/src/sync/` module (`discovery.ts`, `http.ts`, `protocol.ts`, `merge.ts`), kept separate from `TaskStore` so replacing mDNS with a tailnet lookup later is a one-file change.

### Sync orchestration — when does it run?

Four triggers, increasing in automation:

1. **`task-man sync` (manual, one-shot).** Discover peers for ~2 seconds, list them, sync with the chosen one, print the summary, exit. This is the "I'm home, let me reconcile" command.
2. **`task-man sync pair` (one-time setup).** Exchange `device_id`s and confirm the shared `secret` on each machine. Writes to `~/.task-man/config.json`.
3. **`task-man sync --daemon` (background).** Advertises + discovers + syncs automatically when a paired peer appears. Rate-limited (e.g. no more than one sync per 60 s per peer) so a flapping network doesn't churn.
4. **TUI integration.** On TUI startup, briefly (500 ms) check for peers; if a paired one is present, offer a "Sync? [y/N]" prompt in the footer. A `:sync` command from inside the TUI is also available. Nothing auto-syncs from the TUI without confirmation — the user shouldn't be surprised mid-focus.

MCP integration: expose `task_sync` as a tool, so the user can ask Claude "reconcile with my other laptop" conversationally. Same underlying code path as `task-man sync`.

### Safety and observability

- Before writing merged state back, `TaskStore` writes a `~/.task-man/backups/tasks-<iso>.json` copy of the pre-merge local store. Keep the last 10. This is cheap and worth it — sync is the one operation that can meaningfully rewrite user data in one shot.
- After every sync, print the summary (see merge engine). The TUI shows it as a toast; the CLI prints it to stdout.
- Abort conditions:
  - Peer's snapshot fails to parse as a valid `Task[]` → refuse, log, do not touch local store.
  - Peer's snapshot would delete > 50% of non-tombstoned local tasks without a corresponding tombstone on the peer → refuse and prompt for manual confirmation. (Guards against a corrupted peer.)

## Critical files

Already exist — will touch:
- `cli/src/types.ts:8` — add `deleted_at`, `updated_by_device` to `Task`; add `sync` block to `TaskManConfig`.
- `cli/src/store.ts:158` — change `remove()` to soft-delete; add a `mergeSnapshot(peerTasks)` entry point; filter tombstones out of `load`/`query`.
- `cli/src/commands/` — new `sync.ts` (subcommands: bare, `pair`, `--daemon`). Register in the existing CLI entry point (check `cli/src/index.ts` or wherever commands are wired).
- `cli/src/ui/InteractiveApp.tsx` — TUI peer-detected prompt and `:sync` command.
- `mcp/src/index.ts` — register a `task_sync` tool that delegates to the same sync routine.

New:
- `cli/src/sync/merge.ts` — pure merge function + unit tests.
- `cli/src/sync/discovery.ts` — mDNS advertise / discover.
- `cli/src/sync/http.ts` — tiny HTTP server and client.
- `cli/src/sync/protocol.ts` — shared types for the wire format.
- `cli/src/__tests__/sync-merge.test.ts` — heavy unit coverage of the merge rules.

Reuse:
- `withLock` (`cli/src/lock.ts`) for the write-back path.
- The existing atomic-save pattern (`cli/src/store.ts:32`) — don't roll a new write path; go through `TaskStore`.

## Verification

Unit:
- Merge engine: "task only on A" / "task only on B" / "both, A newer" / "both, B newer" / "both, identical" / "A edited, B deleted, delete newer" / "A edited, B deleted, edit newer" / "exact tie, tiebreaker by device_id". These are straightforward pure-function tests.
- Tombstone handling: `TaskStore.remove()` sets `deleted_at`, and `load()`/`query()` filter the task out but `mergeSnapshot` still sees it.
- Parent integrity: a task whose parent is tombstoned continues to render without crashing the TUI (check `FocusMode` / `PlanMode` render paths).

Integration:
- Spin up two `TaskStore`s pointing at different temp files. Advertise both on mDNS in a test harness. Add tasks on each, run sync, assert both files end up identical.
- Secret mismatch: peer A with secret X, peer B with secret Y — `POST /sync` returns 401, no mutation.
- Divergence abort: peer sends a snapshot missing 80% of local tasks (no tombstones) — sync refuses, local store untouched, exit code signals refusal.

Manual:
- `task-man sync pair` on laptop A, copy the secret, `task-man sync pair --secret <x>` on laptop B.
- Add a task on A, close task-man. Run `task-man sync` on B. Verify the task appears in `task-man list` on B.
- Repeat in reverse. Delete a task on B, sync to A, verify A no longer lists it (but the tombstone is in the JSON).
- Run `task-man sync --daemon` on both, watch logs as you toggle wifi.

## Phone and mobile — follow-up, not v1

Since the sync layer is already serving HTTP on the LAN, a couple of unlocks become cheap adjacents:

- **Phone LAN web view.** Your phone on the same wifi can hit `http://<laptop>.local:<port>` (iOS and Android both resolve `.local` via Bonjour). Adding a `GET /` route that renders a mobile-friendly outrun HTML view — read tasks, `[x]` to mark done, quick-add form — is a few hundred lines against the same HTTP server. No Claude involvement. Nice for couch capture.
- **Phone + Claude mobile MCP.** Claude's mobile custom-connectors require an HTTPS public URL; they won't hit plain LAN HTTP. The shortest path is a Cloudflare Tunnel (or Tailscale Funnel) pointed at the laptop's MCP port with a bearer token. User owns domains, so a `taskman.<yourdomain>` tunnel is clean and costs nothing. Deferred until after LAN sync lands.

## Open questions / deferred

- **Clock skew.** If one machine's clock is wildly off, LWW can silently prefer the wrong edit. For v1, document and rely on NTP. A vector-clock or Lamport-counter upgrade is a v2 concern and the merge-engine signature won't change.
- **Tombstone compaction.** 30-day prune job is mentioned but not implemented in v1. Simple cron-like check on `task-man sync` or TUI startup would be enough later.
- **Tailscale.** Explicitly deferred. The discovery module's shape (`findPeers(): Promise<Peer[]>`) is the seam — swap mDNS for a tailnet API call and the rest is unchanged.
- **Web/mobile (Phase 4 in the PRD).** Still the eventual real backend story. This plan intentionally does not move the needle on that — it's a bridge for the user's current two-laptop reality, not a commitment.
