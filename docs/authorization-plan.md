# Authorization Plan — identity-scoped tasks before the droplet ships

Status: **implemented, 2026-07-03** (option A, per-identity namespaces, including the
companion zod validation). All eight steps landed; the verification checklist at the
bottom is covered by `cli/src/__tests__/{scoped-store,authorization,access-auth}.test.ts`.

Two additions discovered during implementation, beyond what's written below:

- **Scoped↔global index translation.** The TUI's undo/paste round-trips the index that
  `remove()` returns into `insertAt()`, computed against the list the client *sees* —
  the scoped one. `scoped-store.ts` therefore reports positions within the owner's
  tasks and maps them back to global file positions on insert; without this, remote-mode
  undo would splice tasks into the wrong place (and could interleave into other
  namespaces' ordering).
- **`UpdateTaskInput.description` widened to `string | null`** so a description can be
  cleared through the validated PATCH route (TaskChanges always allowed null).

## Problem

Cloudflare Access authenticates (who can reach the app at all) but the app has no
authorization: every authenticated identity sees and can mutate every task,
including personal-scope ones. Fine while the Access policy is one email; broken
the moment a colleague is added.

## The product decision this hangs on

**What does "a few colleagues" mean?**

- **(A) They use the tool for *their own* tasks** — separate lists, same deployment.
- **(B) We collaborate on *shared* tasks** — one list, per-task visibility rules.

**Recommendation: build (A) — per-identity namespaces.** It matches the PRD (a
*personal* tool "serving one user through one working day"), requires no sharing
UX, no per-task ACLs, and no changes to any client. (B) can be layered on later
via an explicit `shared_with` field without undoing (A). If (B) is actually the
goal, stop and redesign — the rest of this plan assumes (A).

## Design

### Identity

Identity is established by the existing `access-auth.ts` middleware (already
landed), which verifies the Access JWT and exposes:

- `email` claim — interactive callers (web browser, TUI via `cloudflared` JWT)
- `common_name` claim — service tokens (headless MCP)

Service tokens are machine credentials, so they must be *mapped* to the person
they act for: a `TASK_MAN_AGENTS` env var on the server, e.g.
`TASK_MAN_AGENTS="<common_name>=mario@example.com"`. An authenticated identity
that is neither an email nor a mapped agent gets 403 — Access lets them in the
door, the app still refuses (two independent layers).

No user table, no roles. The Access policy *is* the allowlist; every allowed
email automatically gets its own namespace on first request. There are no
cross-user operations in v1, so there is nothing for an "admin" to do.

### Data model

```ts
// types.ts — Task gains:
owner?: string | null;   // email; null/absent = legacy task
```

Legacy tasks (all of Mario's existing data) are handled lazily: the server reads
`TASK_MAN_DEFAULT_OWNER` (set once in deploy/.env) and treats `owner == null` as
belonging to that identity at *filter* time. No data migration, no rewrite of
`tasks.json`. New/updated tasks get `owner` stamped explicitly, so the null
population only shrinks.

### Enforcement point: a `Store` wrapper on the server

One new module, `cli/src/server/scoped-store.ts`:

```ts
export function scopeStore(store: Store, owner: string): Store
```

- `load()`/`query()`/`getCompletedOn()`/… → filter results to `owner` (treating
  null-owner as `TASK_MAN_DEFAULT_OWNER`'s)
- `resolveId()` → resolve prefixes against the owner's tasks only (no
  cross-tenant existence leaks; prefixes stay short)
- `add()`/`insertAt()` → stamp `owner`; subtasks inherit the parent's owner and
  reject a `parent_id` the caller doesn't own
- `update()`/`remove()` → resolve within the owner's tasks; a foreign id behaves
  exactly like a nonexistent one (404, not 403 — don't confirm existence)

`routes.ts` builds it per-request from the identity the middleware already set:

```ts
const identity = c.get('accessIdentity');            // set by access-auth.ts
const s = identity ? scopeStore(store, resolveAgent(identity)) : store;
```

When auth is disabled (local dev, no `CF_ACCESS_*` env), the raw store is used —
today's behavior, unchanged. **No client changes at all**: TUI, MCP, and web
already talk to the server with credentials; the server simply starts answering
with only their slice.

### What deliberately stays out

- **Sharing/visibility rules** — future `shared_with: string[]` if (B) ever
  materializes. The wrapper is the single place it would slot into.
- **Roles/admin** — nothing to administer in v1.
- **Local-mode enforcement** — `LocalStore` never filters. Local mode is
  physically single-user; pretending otherwise adds complexity with no threat.
- **Web UI changes** — none needed; it just sees the caller's tasks.

### Interactions checked

| Concern | Resolution |
|---|---|
| Idempotency cache collisions across users | Key the cache on `identity + Idempotency-Key` |
| `/api/tasks` convenience routes vs `/api/store/*` primitives | Both get the scoped store — enforcement is below both dialects |
| Stats/metrics/categories/search | All flow through `Store` reads → automatically scoped |
| `created_by` (human/claude) | Orthogonal to `owner` — attribution ≠ ownership; unchanged |
| Prefix ambiguity | Scoped resolution actually *improves* — prefixes only need to be unique within your own tasks |
| Insights log | Already client-local per machine; unaffected |

## Companion change: request validation (same PR or adjacent)

Both this plan and basic hygiene want typed inputs at the HTTP boundary, and
authorization is only as strong as the parser in front of it (`/api/store/update`
currently `Object.assign`s arbitrary JSON — including `owner` itself, which must
be rejected as a client-settable field once it exists). Add zod schemas
(`cli/src/server/schemas.ts`) for every POST/PATCH body and query param set:
unknown fields stripped, enums enforced, `owner`/`created_at`/`updated_at`
non-assignable via `changes`. Zod is already in the dependency tree (mcp/).

## Steps

1. `types.ts`: add `owner` to `Task`; add to `CreateTaskInput` as server-internal
   (not client-assignable).
2. `cli/src/server/schemas.ts`: zod schemas; wire into routes (validation errors → 400).
3. `cli/src/server/scoped-store.ts` + unit tests (two identities, foreign-id 404s,
   subtask inheritance, null-owner legacy fallback, prefix scoping).
4. `access-auth.ts`: `resolveAgent()` — apply `TASK_MAN_AGENTS` mapping; unknown
   non-email identity → 403.
5. `routes.ts`: per-request scoping; identity-keyed idempotency cache.
6. `deploy/.env.example` + phase2 guide: `TASK_MAN_DEFAULT_OWNER`, `TASK_MAN_AGENTS`.
7. Integration tests: full request cycle with two signed JWTs (reuse the signing
   helper from `access-auth.test.ts`) asserting isolation both ways.
8. Docs: system-map auth section, cli/README config table.

Rough size: steps 2–3 are the bulk; the rest are small. One focused session.

## Verification before droplet ships

- Two-identity test suite green.
- `curl` as identity A cannot list/read/update/delete identity B's task by full id.
- Legacy (`owner: null`) tasks visible to `TASK_MAN_DEFAULT_OWNER` only.
- MCP service token maps to Mario's namespace and round-trips.
- With `CF_ACCESS_*` unset (local dev): behavior identical to today.
