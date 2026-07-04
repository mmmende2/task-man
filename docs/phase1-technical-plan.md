# Phase 1 Technical Implementation Plan — task-man remote-capable client

*Produced by an Opus planning pass against the current source, grounding `deploy-plan.md`'s Phase 1 (sections 1a-1e) in concrete file-level changes. Read `deploy-plan.md` first for product context.*

## 0. Findings that change the doc's design (read first)

Before the file-by-file steps, three things surfaced from the actual source that the product doc did not account for. They drive every decision below.

**F1 — The Store surface is synchronous for reads, and that is load-bearing.**
`TaskStore`'s read methods (`load`, `query`, `resolveId`, `getCompletedOn`, `getCreatedOn`, `getInProgressUpdatedOn`) are all **synchronous** and are called synchronously in React render (`useTaskStore.ts:7` inside a `useState` initializer; `useMemo(() => store.load())` in `MetricsMode`, `RefineMode`, `WriteMode`, `FocusMode`, `PlanMode`, `InteractiveApp`) and inside synchronous handlers (`listTasks`, `getTask`, `searchTasks`, `getStats`, `getCategories`). A `RemoteStore` speaking HTTP **cannot** implement synchronous reads. The doc's "extract the Store interface from TaskStore's public surface and have RemoteStore implement it" is therefore only viable if the interface is made **fully async**. There is no trick around this — any remote TUI read path must become async. This is the single biggest cost of Phase 1 and the thing most likely to be mis-estimated. It is contained (see Decision A) but unavoidable.

**F2 — The web's `POST /api/tasks` route has web-specific semantics that would corrupt a generic store proxy.** `routes.ts:159-182` (`createTask` path) hard-codes `created_by: 'human', session_id: null` and applies prefix-resolution/sorting. A generic `RemoteStore.add()` must faithfully persist whatever `CreateTaskInput` it is handed — including MCP's `created_by: 'claude'` and `session_id`. If `RemoteStore` reused `/api/tasks`, **all MCP-created tasks would be silently re-attributed to `human` in remote mode.** RemoteStore therefore must NOT reuse the web's semantic routes. The plan introduces a dedicated faithful-primitive route group `/api/store/*` that mirrors `TaskStore` method-for-method, and leaves the existing web `/api/*` routes alone (minus auth). This also cleanly satisfies doc 1b.

**F3 — This is not an npm workspace.** Root `package.json` has no `workspaces` field. `web` and `mcp` depend on the `cli` package via `"task-man": "file:../cli"` and import built subpaths through cli's `exports` map (e.g. `web/src/api.ts` already does `import ... from 'task-man/types'`). So the shared `api-client` lives in `cli/src/`, is added to cli's `exports` map, and web imports it as `task-man/api-client` (built) while `cli` imports it relatively. Consequence: `api-client.ts` must be **browser-safe** — no `node:` imports. The cloudflared/JWT logic must live in `remote-store.ts` (cli-only), never in `api-client.ts`.

**F4 — Concern #1 resolved: `cf-access-token` is correct.** Per current Cloudflare One docs, a user JWT obtained via `cloudflared access token --app=<url>` is presented to the Access-protected origin in the **`cf-access-token`** request header — this is exactly the header `cloudflared access curl` auto-injects. `Cf-Access-Jwt-Assertion` is the header Cloudflare *injects toward the origin after* it validates the request; the client must **not** send it. The doc's `cf-access-token` choice is right. One refinement worth a decision (see Risks): for **headless MCP**, a non-expiring **service token** (`CF-Access-Client-Id` / `CF-Access-Client-Secret` headers) avoids the interactive `cloudflared access login` re-auth that the user JWT requires when the Access session expires.
Sources: [Validate JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Connect through Access using a CLI](https://developers.cloudflare.com/cloudflare-one/tutorials/cli/), [Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).

---

## Decision A — Architecture (make these choices, do not re-litigate mid-build)

1. **`Store` is a fully async interface.** Every method returns a `Promise`.
2. **`TaskStore` stays exactly as it is (synchronous reads, unchanged file logic).** It is NOT retrofitted to implement `Store` directly. This deliberately keeps every existing synchronous caller working: all one-shot CLI commands (`add`, `list`, `focus`, `done`, `start`, `session-refocus`, `end-day`), `preview.tsx`, and the ~15 test files that do `new TaskStore()` + sync `load()/query()`.
3. **A thin `LocalStore` adapter implements `Store` by wrapping a `TaskStore`** (each method is a one-line async pass-through). Local mode returns `new LocalStore(new TaskStore())`.
4. **`RemoteStore` implements `Store` over HTTP** against `/api/store/*`, with client-side derivation of the read-filter methods so only 5 server endpoints are needed.
5. **Only code that consumes a `Store` becomes async.** That set is: the store factory, the TUI hook + TUI mode read paths, the shared handlers, the report/insights/stats/metrics engines, MCP tools, and the server routes. Everything else is untouched.
6. **Scope boundary (flag to product owner):** one-shot CLI commands stay **local-only** in Phase 1 (they keep a concrete `TaskStore`). Only TUI + MCP go remote, matching the doc's wiring targets. "Remote one-shot CLI commands" is an explicit follow-up.

---

## 1. The `Store` interface — `cli/src/store-interface.ts` (new)

Extract a named type for the update-changes bag (currently an inline `Partial<Pick<...>>` on `TaskStore.update`) and define the async interface.

```ts
import type { CreateTaskInput, Task, TaskFilter } from './types.js';

export type TaskChanges = Partial<Pick<Task,
  | 'title' | 'description' | 'status' | 'priority' | 'scope' | 'categories'
  | 'focused' | 'completed_at' | 'session_id' | 'time_estimate' | 'vibe' | 'parent_id'>>;

export interface Store {
  load(): Promise<Task[]>;
  query(filter?: TaskFilter): Promise<Task[]>;
  resolveId(prefix: string): Promise<string>;
  add(input: CreateTaskInput): Promise<Task>;
  update(id: string, changes: TaskChanges): Promise<Task>;
  remove(id: string): Promise<{ task: Task; index: number }>;
  insertAt(task: Task, index: number): Promise<Task>;
  getCompletedOn(date: string): Promise<Task[]>;
  getCreatedOn(date: string): Promise<Task[]>;
  getInProgressUpdatedOn(date: string): Promise<Task[]>;
}
```

The method set is exactly `TaskStore`'s current public surface (per `store.ts`; `save` is private and excluded). Add cli export: `"./store-interface": "./dist/store-interface.js"` in `cli/package.json` (needed by `mcp` and, if ever, `web`).

**Extract shared pure read helpers** into `cli/src/task-filters.ts` (new) so `TaskStore`, `LocalStore` (via TaskStore), and `RemoteStore` produce byte-identical results:
- `applyFilter(tasks: Task[], filter: TaskFilter): Task[]` — the body of `TaskStore.query` (lines 128-144).
- `resolvePrefix(tasks: Task[], prefix: string): string` — the body of `TaskStore.resolveId` (lines 84-94), including the exact "No task found" / "Multiple tasks match" error strings (the server's `onError` regex in `routes.ts:66-71` depends on those strings).
- `completedOn/createdOn/inProgressUpdatedOn(tasks, date)` — the three one-line `isOnLocalDate` filters (lines 153-163).

Then refactor `TaskStore.query/resolveId/getCompletedOn/getCreatedOn/getInProgressUpdatedOn` to delegate to these helpers (keeps behavior identical, DRY with RemoteStore). This is a pure refactor with zero behavior change — the existing `store.test.ts` guards it.

---

## 2. `LocalStore` adapter — `cli/src/local-store.ts` (new)

```ts
import { TaskStore } from './store.js';
import type { Store, TaskChanges } from './store-interface.js';
import type { CreateTaskInput, Task, TaskFilter } from './types.js';

export class LocalStore implements Store {
  constructor(private readonly inner: TaskStore = new TaskStore()) {}
  async load() { return this.inner.load(); }
  async query(filter?: TaskFilter) { return this.inner.query(filter); }
  async resolveId(prefix: string) { return this.inner.resolveId(prefix); }
  async add(input: CreateTaskInput) { return this.inner.add(input); }
  async update(id: string, changes: TaskChanges) { return this.inner.update(id, changes); }
  async remove(id: string) { return this.inner.remove(id); }
  async insertAt(task: Task, index: number) { return this.inner.insertAt(task, index); }
  async getCompletedOn(date: string) { return this.inner.getCompletedOn(date); }
  async getCreatedOn(date: string) { return this.inner.getCreatedOn(date); }
  async getInProgressUpdatedOn(date: string) { return this.inner.getInProgressUpdatedOn(date); }
}
```

(The `inner.add` etc. that return Promises are already awaited by `return`.)

---

## 3. `api-client.ts` extraction — `cli/src/api-client.ts` (new), browser-safe

Move the transport primitives out of `web/src/api.ts` (lines 17-47): `ApiError`, `idempotencyKey()`, `unwrap<T>()`. Add a small `HttpClient` factory that both surfaces parameterize (web = same-origin + cookies; cli = absolute base URL + `cf-access-token` header, no cookies).

```ts
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function idempotencyKey(): string { /* moved verbatim from web/src/api.ts:28-33 */ }
export async function unwrap<T>(res: Response): Promise<T> { /* moved verbatim from web/src/api.ts:35-47 */ }

export interface HttpClientOptions {
  baseUrl?: string;                          // '' for same-origin web; 'https://tasks...' for cli
  credentials?: RequestCredentials;          // 'include' for web
  authHeaders?: () => Promise<Record<string, string>>; // '' for web; cf-access-token for cli
}

export function createHttpClient(opts: HttpClientOptions = {}) {
  const base = opts.baseUrl ?? '';
  async function req<T>(path: string, init: RequestInit = {}, jsonBody?: unknown): Promise<T> {
    const auth = opts.authHeaders ? await opts.authHeaders() : {};
    const res = await fetch(base + path, {
      credentials: opts.credentials,
      ...init,
      headers: { 'Content-Type': 'application/json', ...auth, ...(init.headers ?? {}) },
      body: jsonBody !== undefined ? JSON.stringify(jsonBody) : init.body,
    });
    return unwrap<T>(res);
  }
  return { req, idempotencyKey };
}
```

**Constraints:** no `node:*` imports (web bundles this); uses only global `fetch` (Node ≥18 and browser both have it — cli/mcp run on Node 22 per the droplet, and cli's engines are modern). Do not import from `web/*` here (dependency direction is web → cli).

**Rewire `web/src/api.ts`:** import `{ ApiError, unwrap, idempotencyKey, createHttpClient }` from `task-man/api-client`; delete the local copies (lines 17-47). Keep `web/src/api.ts` as the web's thin object of named calls, but built over `createHttpClient({ baseUrl: '', credentials: 'include' })`. Delete `login`/`logout`; convert `session()` to `async () => true` (or delete and update callers — see §7). Add cli export `"./api-client": "./dist/api-client.js"`.

**Note on `Idempotency-Key` header:** `createTask`/`RemoteStore.add` must set it (`headers: { 'Idempotency-Key': key }`); reuse `idempotencyKey()`.

---

## 4. `RemoteStore` — `cli/src/remote-store.ts` (new), cli-only

Implements `Store`. Constructor `(baseUrl: string, opts?: RemoteStoreOptions)`. Reads derive client-side from a single `load()`; writes post to `/api/store/*` and let the server's `TaskStore` do resolution + locking (server is source of truth — avoids client-side races).

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHttpClient, ApiError } from './api-client.js';
import { applyFilter, resolvePrefix, completedOn, createdOn, inProgressUpdatedOn } from './task-filters.js';
import type { Store, TaskChanges } from './store-interface.js';
import type { CreateTaskInput, Task, TaskFilter } from './types.js';

export interface RemoteStoreOptions {
  authHeaders?: () => Promise<Record<string, string>>;   // default: selected by get-store.ts per §12.2
}
```

**Auth — two provider implementations, selected by `get-store.ts` (locked decision, §12.2):**
- `serviceTokenAuth(id: string, secret: string)`: returns `{ 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret }` on every call — no caching needed, the token doesn't expire. Used for MCP (headless — this is the default when `client.service_token_id`/`service_token_secret` are set).
- `cloudflaredJwtAuth(baseUrl: string)`: default fallback (TUI). Shells `cloudflared access token --app=<baseUrl>` via `execFile` (never `exec`; no shell interpolation of the URL). Cache in-memory:
  - Decode the JWT payload (middle base64url segment) to read `exp`; cache until `exp - 60s` skew.
  - If decode fails, fall back to a fixed conservative TTL (e.g. 10 min).
  - Returns `{ 'cf-access-token': <jwt> }`.
- `get-store.ts` picks `serviceTokenAuth` when both service-token config fields are present, else `cloudflaredJwtAuth`. Pass the chosen provider as `authHeaders` into `createHttpClient({ baseUrl, authHeaders })`.

**Failure taxonomy (exact, so the engineer doesn't invent behavior):**
- `cloudflared` missing (`ENOENT`): throw `Error("cloudflared not found. Install it (brew install cloudflared) and run 'task-man login'.")`.
- `cloudflared` exits non-zero / empty stdout (not logged in or session expired): throw `Error("Not authenticated to <baseUrl>. Run 'task-man login'.")`.
- `fetch` rejects (network/DNS/offline): throw `Error("Cannot reach <baseUrl>. Check your connection.")` — do **not** mention login.
- Server responds `401`/`403` (Access rejected the token): invalidate the cached token, refresh **once**, retry the request once. If it still 401/403: throw `Error("Access denied for <baseUrl>. Run 'task-man login' (your session may have expired).")`.
- Server responds `4xx`/`5xx` with `{ error }`: let `unwrap` throw `ApiError(status, body.error)` — identical to the web path; the server's `onError` already maps store errors to 404/400/500. Do **not** retry these.

**Retry policy:** exactly one retry, only for (a) `fetch` network rejection and (b) 401/403-after-refresh. Writes carry an `Idempotency-Key` so a retried `add`/`insertAt` can't duplicate. Reads are naturally idempotent.

**Method mapping:**
```ts
async load()                 // GET  /api/store/tasks              -> Task[]
async query(f)               // await this.load(); applyFilter(tasks, f)
async resolveId(prefix)      // await this.load(); resolvePrefix(tasks, prefix)
async getCompletedOn(d)      // await this.load(); completedOn(tasks, d)
async getCreatedOn(d)        // await this.load(); createdOn(tasks, d)
async getInProgressUpdatedOn(d) // await this.load(); inProgressUpdatedOn(tasks, d)
async add(input)             // POST /api/store/add     {input}    (Idempotency-Key) -> Task
async update(id, changes)    // POST /api/store/update  {id, changes} -> Task   (server resolves id)
async remove(id)             // POST /api/store/remove  {id}       -> {task, index}
async insertAt(task, index)  // POST /api/store/insertAt {task, index} (Idempotency-Key) -> Task
```
Client-side reads over a fresh `load()` are acceptable at personal scale (hundreds of tasks). If a chatty-reads concern ever bites, add server-side `GET /api/store/tasks?…` filters later — the `Store` contract does not change.

Add cli export `"./remote-store": "./dist/remote-store.js"`.

---

## 5. Server route additions — `cli/src/server/routes.ts`

**5a. Remove PIN auth (doc 1a).**
- Delete the `app.use('/api/*', …)` gate (lines 74-78), `/api/auth/login` (81-103), `/api/auth/logout` (105-108). For `/api/auth/session` (111): keep a stub `app.get('/api/auth/session', c => c.json({ authenticated: true }))` **only if** you keep the web's `AuthGate` (see §7); otherwise delete it and simplify the web. Recommend: keep the stub returning `{ authenticated: true }` this phase to minimize web churn.
- Remove `pin`/`sessionSecret` from `ServerDeps` (30-34) and the destructure (58). Change `ServerDeps.store` type from `TaskStore` to `Store`.
- Remove the imports from `./auth.js` that are now unused (`clearSession`, `constantTimeEqual`, `createRateLimiter`, `hasValidSession`, `issueSession`; `clientIp` no longer needed here). Delete `cli/src/server/auth.ts` entirely (nothing else imports it after this — verify with grep). The rate limiter/`clientIp`/session cookie machinery all go.
- `makeIdempotencyCache` stays (used by both `/api/tasks` POST and new `/api/store/add`).

**5b. Make existing handler calls await.** Since handlers become async (§6), add `await` to the read routes that currently call them synchronously: `/api/tasks` (listTasks, line 116), `/api/search` (searchTasks, 132), `/api/stats` (getStats, 141), `/api/metrics` (buildMetrics, 148), `/api/categories` (getCategories, 151), `/api/tasks/:id` (getTask, 154). The write routes already `await`. Handlers now take a `Store`; the app's `store` is a `Store` (§5d).

**5c. Add the faithful-primitive `/api/store/*` group (doc 1b, F2).** These call the `Store` directly (not the web handlers), pass-through, no `created_by` override:
```ts
app.get('/api/store/tasks', async (c) => c.json(await store.load()));

app.post('/api/store/add', async (c) => {
  const key = c.req.header('Idempotency-Key');
  if (key) { const hit = idempotency.get(key); if (hit) return c.json(hit.body, hit.status); }
  const { input } = await c.req.json();
  const task = await store.add(input);           // faithful: honors created_by, session_id, focused, parent_id
  if (key) idempotency.set(key, { status: 201, body: task });
  return c.json(task, 201);
});

app.post('/api/store/update', async (c) => {
  const { id, changes } = await c.req.json();
  return c.json(await store.update(id, changes)); // server-side resolveId + lock
});

app.post('/api/store/remove', async (c) => {
  const { id } = await c.req.json();
  return c.json(await store.remove(id));
});

app.post('/api/store/insertAt', async (c) => {
  const key = c.req.header('Idempotency-Key');
  if (key) { const hit = idempotency.get(key); if (hit) return c.json(hit.body, hit.status); }
  const { task, index } = await c.req.json();
  const inserted = await store.insertAt(task, index);
  if (key) idempotency.set(key, { status: 201, body: inserted });
  return c.json(inserted);
});
```
The existing `onError` (66-71) already maps `resolveId`/parent errors to 404/400 — RemoteStore's read-derived resolution won't hit these (server resolves on writes), so error-string parity via `task-filters.ts` matters. Keep `/healthz` open (63) for the remote status ping (§7).

**5d. Update `createApp`.** `createApp({ store }: ServerDeps)` where `ServerDeps.store: Store`. Server entry wraps: see §9.

---

## 6. Handlers + engines become async (`Store`-typed)

Minimal-diff approach: change the `store: TaskStore` parameter type to `store: Store` and add `async`/`await`; **no input/output shape changes**, so routes and MCP keep the same call sites (plus `await`).

- `cli/src/handlers/tasks.ts`: `listTasks`, `getTask`, `searchTasks` become `async` (they call `store.query/load/resolveId`). `createTask`/`updateTask`/`deleteTask`/`completeTask`/`startTask`/`focusTask`/`unfocusTask` are already `async` — change param type to `Store`, add `await` before `store.resolveId(...)` calls (e.g. lines 73, 107, 121, 152, 170, 187) and the `store.query` in `deleteTask` (188). `sortTasks` stays pure/sync.
- `cli/src/handlers/stats.ts`: `getStats`, `getCategories` become `async` (`await store.load()`), param `Store`.
- `cli/src/handlers/metrics.ts`: `buildMetrics(store, date)` becomes `async` (`await store.load()`, line 13; plus any report calls).
- `cli/src/report.ts` (`buildDayReport`) and `cli/src/insights.ts`: become `async`, param `Store`, `await` each `store.getCompletedOn/getCreatedOn/getInProgressUpdatedOn/load/query` (report lines 8-31; insights 43-150). Callers are already async contexts (MCP `task_end_day`, `end-day` command action) — they just add `await` and pass a `Store`.
- `cli/src/refine-queue.ts` (`buildRefineQueueWithReasons`) already takes `Task[]` — leave as pure; callers pass `await store.load()`.

Blast radius of the "engines async" change and its non-getStore callers:
- `cli/src/commands/end-day.ts:20` (`store.load()` → wrap concrete `TaskStore` in `LocalStore` or just `await new LocalStore(store).load()`; simplest: the command builds `const store = new LocalStore(new TaskStore())` and `await`s buildDayReport/renderDayReportMarkdown).
- `cli/src/preview.tsx:24` (dev-only): make its top-level `await store.load()` or keep it on a concrete `TaskStore` sync path (it doesn't call the async engines). Lowest-effort: leave `preview.tsx` on concrete `TaskStore`.
- `cli/src/commands/session-refocus.ts`, `add.ts`, `list.ts`, `focus.ts`, `done.ts`, `start.ts`: these use concrete `TaskStore` sync/async as today — **unchanged** (they don't consume `Store` and stay local-only per Decision A.6).

---

## 7. Web changes (doc 1a tail)

- `web/src/api.ts`: rewired per §3. Remove `login`/`logout`. Keep `session()` as `async () => true` (stub) to avoid touching `AuthGate`, OR delete `session()` and simplify. Recommend the stub for a minimal Phase-1 diff.
- `web/src/pages/Login.tsx` + `Login.css`: remove the route. In `web/src/App.tsx`, delete the `/login` `<Route>` (line 39) and the redirect-to-login logic in `AuthGate` (23-26); with the stub `session()`→true, `AuthGate` reduces to "render children" (or delete `AuthGate` entirely and render `<Routes>` directly). `LoginPage` import removed.
- `web/src/components/NavMenu.tsx:48`: remove the `api.logout()` call and the logout menu item (`NavMenu.css:107` `.logout` style can go). In production the "sign out" concept is owned by Cloudflare Access, not the app. Optional (doc's suggestion): if you want "signed in as X", have the server read `Cf-Access-Jwt-Assertion` (injected by Access) and expose identity via `/api/auth/session` — **defer to a follow-up**, not Phase 1.
- Verify web build still resolves `task-man/api-client` (cli must be built first — already the case for `task-man/types`).

---

## 8. Config + `login` command (doc 1d)

**Types (`cli/src/types.ts`):**
```ts
export interface TaskManConfig {
  // …existing…
  client?: {
    mode?: 'local' | 'remote';
    remote_url?: string;
    // headless-MCP service token (see Risks); optional this phase:
    service_token_id?: string;
    service_token_secret?: string;
  };
  server?: { port?: number; bind?: string };  // pin + session_secret REMOVED (doc 1a)
}
```
Remove `server.pin` and `server.session_secret` (lines 67-68).

**Defaults (`cli/src/constants.ts`):** add `client: { mode: 'local' }` to `DEFAULT_CONFIG`. Remove nothing from `server` default (`port`/`bind` stay).

**Config commands:** `cli/src/commands/config.ts` already supports arbitrary dot-paths via `setConfigValue`/`getConfigValue`, and `setConfigValue` correctly stores strings (URL) and creates nested objects. So **no new config subcommand is needed** — `task-man config client.remote_url https://tasks.example.com` and `task-man config client.mode remote` work as-is. (Recommend adding a validation guard in `setConfigValue` or `getStore` that `client.mode` ∈ {local,remote}; a typo currently silently falls back to local.)

**`task-man login` (new — `cli/src/commands/login.ts`):** thin wrapper that reads `client.remote_url` from config and runs `cloudflared access login <remote_url>` via `execFile`, inheriting stdio so the browser flow prints normally. If `remote_url` unset → friendly error telling the user to set it first. If `cloudflared` missing (`ENOENT`) → "Install cloudflared: brew install cloudflared". Register in `cli/src/index.ts` (add `import { loginCommand } …` and `program.addCommand(loginCommand)`).

**`task-man serve` (`cli/src/commands/serve.ts`, doc 1a):** delete `setPin()` (15-31), the `--set-pin` option (37) and its branch (39-42), and the "No web PIN set" guard (44-49). Update `--help`/startup text: drop the "Enter your PIN" line (74); document `--bind 127.0.0.1` as the recommended local-dev/unauthenticated option and `--bind 0.0.0.0` as the container/Tunnel default.

---

## 9. Store factory + wiring (doc 1e)

**`cli/src/get-store.ts` (new):**
```ts
import { loadConfig } from './config.js';
import { LocalStore } from './local-store.js';
import { RemoteStore } from './remote-store.js';
import { TaskStore } from './store.js';
import type { Store } from './store-interface.js';

export function getStore(): Store {
  const cfg = loadConfig();
  if (cfg.client?.mode === 'remote' && cfg.client.remote_url) {
    return new RemoteStore(cfg.client.remote_url);
  }
  return new LocalStore(new TaskStore());
}
```
Add cli export `"./get-store": "./dist/get-store.js"` (mcp imports it).

**Called once at module/hook init — NOT dynamic (confirmed).** Both consumers construct the store once; switching `client.mode` while the TUI or MCP process is running takes effect only on restart. This is intended; do not add config-watching or re-instantiation.

- **`cli/src/ui/hooks/useTaskStore.ts`:** replace `new TaskStore()` (line 2/6) with `getStore()` (once, in the `useRef`). Because `query` is now async, the `useState` initializer can no longer read synchronously. Change to: initialize `tasks` to `[]`, load in an effect, and make `reload` async:
  ```ts
  const storeRef = useRef<Store>(getStore());
  const [tasks, setTasks] = useState<Task[]>([]);
  const reload = useCallback(() => { storeRef.current.query(filter).then(setTasks); }, [filter]);
  useEffect(() => { reload(); }, [reload]);           // initial load
  // keep the pollInterval effect
  ```
  Returns `{ tasks, reload, store }` as before (store is now a `Store`). A brief empty-first-frame is acceptable in the TUI.

- **TUI mode components** (`FocusMode`, `PlanMode`, `WriteMode`, `RefineMode`, `MetricsMode`, `InteractiveApp`): every synchronous `store.load()` / `store.query()` in `useMemo`/render must move to an effect-loaded state value. Concretely, replace `const allTasks = useMemo(() => store.load(), [...])` with a `useState<Task[]>([])` + `useEffect(() => { store.load().then(setAllTasks); }, [deps])`. The **write** paths (`store.update(...).then(...)`, `store.add(...).then(...)`, `store.remove(...).then(...)`, `store.insertAt(...)`) are already promise-based and need no change beyond the store being `Store`. Call sites to convert (reads only): `InteractiveApp.tsx:98`, `PlanMode.tsx:268`, `MetricsMode.tsx:39`, `FocusMode.tsx:244`, `RefineMode.tsx:186,189,219`, `WriteMode.tsx:128`. This is the bulk of the TUI effort; it is mechanical but must be done carefully to preserve reload-after-mutation ordering (the existing `.then(() => reload())` chains already sequence correctly).

- **`mcp/src/tools.ts`:** replace `new TaskStore()` (line 56, imported from `task-man/store`) with `getStore()` (import from `task-man/get-store`). Then add `await` to the direct store reads: `store.resolveId` (153, 181, 245), `store.load()` (182, 246, 321, 343, 359), `store.query` (154). The handler calls (`createTask`, `listTasks`, `updateTask`, etc.) are already awaited. For `task_end_day`: `buildDayReport(getStore-store, date)` is now async → `await buildDayReport(store, reportDate)`. For `task_refine_queue`/`task_prioritize`/`task_categories`: change `store.load()` → `await store.load()`. No shape changes to tool outputs.

- **`cli/src/ui/hooks/useServerStatus.ts` (doc 1e):** in **remote** mode the pidfile probe is meaningless. Branch on config: if `client.mode === 'remote'` && `remote_url`, replace `probePid()` with an authenticated `GET <remote_url>/healthz` ping using the same token mechanism (simplest: `new RemoteStore(remote_url).load()` succeeding, or a dedicated lightweight `ping()` on RemoteStore that hits `/healthz` with the `cf-access-token` header). Note `/healthz` is behind CF Access too, so the ping **must** carry the token — a bare fetch returns the Access login HTML (HTTP 200), so treat "reachable **and** authed and JSON `{ok:true}`" as running, anything else as not-running. Keep the 5s interval. In local mode, keep the existing pidfile probe unchanged. (Doc says `GET /api/health`; the real route is `/healthz` — use `/healthz`.)

**Server entry (`cli/src/server/index.ts`):** `startServer` builds `const store = new LocalStore(new TaskStore())` and calls `createApp({ store })` (drop `pin`/`sessionSecret`). Remove `ensureSessionSecret()` (lines 26-33) and its call, and the `pin`/`sessionSecret` locals (68-70). Server is always a local store; it never uses RemoteStore (no loopback).

---

## 10. Tests

**Break & update:**
- `cli/src/__tests__/server.test.ts`: remove the auth suite — `login()` helper, `extractCookie`, "rejects unauthenticated…", "rejects a bad PIN", "issues a cookie…", "rate-limits…" (lines 12-25, 48-90). Every remaining test drops the `Cookie` header and the `login()` call; `createApp({ store, pin, sessionSecret })` (35) becomes `createApp({ store: new LocalStore(store) })`. Add new coverage for the `/api/store/*` group: `add` honors `created_by:'claude'` (the F2 regression guard), `update`/`remove`/`insertAt` round-trip, `Idempotency-Key` replay on `/api/store/add`, and `GET /api/store/tasks` returns raw order.
- `cli/src/__tests__/handlers.test.ts`, `metrics-handler.test.ts`: handlers are now async — add `await` to `listTasks/getStats/getCategories/getTask/searchTasks/buildMetrics` calls. `store.load()` on a concrete `TaskStore` in test setup stays sync (TaskStore unchanged) — but where a test passes the store into an async handler, wrap in `LocalStore` if the handler now requires `Store` (it accepts any `Store`; a concrete `TaskStore` will fail the type since it's not `Store`). Decision: handlers take `Store`; tests construct `new LocalStore(new TaskStore(path))`. Direct `store.load()` assertions in tests can use the concrete `TaskStore` handle separately, or `await localStore.load()`.
- TUI interaction tests (`writemode-interaction`, `viewmode-interaction`, `vim-keys`, `planmode-interaction`, `planmode-overflow`, `metrics-display`, `focus-colors`): these construct `new TaskStore()` and assert via sync `store.load()` — **unchanged** (TaskStore stays sync). But the components they render now read via async `getStore()`/`Store`. Two adjustments: (a) these tests must make the component use a `Store` that points at the test's temp file — check how the store is injected (the hook calls `getStore()` which reads real config → risk of hitting real `~/.task-man`). **Important:** confirm these tests already inject a store/filePath (they appear to build a local `reload = () => setTasks(store.load())` and render modes with an explicit `store` prop). If modes receive `store` as a prop, pass `new LocalStore(taskStore)`; the sync `store.load()` in test bodies stays on the concrete `TaskStore` handle. Where a test asserted immediately after a render that previously loaded synchronously, add `await vi.waitFor(...)` for the now-async first paint (several already use `vi.waitFor`, e.g. `writemode-interaction.test.tsx:187`).
- `cli/src/__tests__/store.test.ts`: **unchanged** (TaskStore public API preserved). This is the guard that the `task-filters.ts` extraction didn't change behavior.

**New tests:**
- `cli/src/__tests__/remote-store.test.ts`: stand up the real Hono app in-process (`createApp({ store: new LocalStore(new TaskStore(tmp)) })`), point a `RemoteStore` at it by injecting a custom `fetch`/`baseUrl` and a stub `tokenProvider: async () => 'test'` (so no `cloudflared`). Assert: `add` faithfully persists `created_by:'claude'`; `update/remove/insertAt` round-trip; `query/resolveId/getCompletedOn` derive correctly from `load()`; error mapping (`resolveId` miss → thrown `ApiError`/message parity); one-retry-on-network behavior via a fetch that fails once. This is where the money is — the RemoteStore↔routes contract.
- `cli/src/__tests__/task-filters.test.ts`: unit-test `applyFilter`/`resolvePrefix`/date filters (they were implicitly covered by `store.test.ts`; now they're shared).

Run `npm test --prefix cli` (vitest) and the web build; MCP has no test script (build-only) — verify `tsc` compiles `mcp` after the `getStore` swap.

---

## 11. Safe incremental sequencing

Each step below compiles and passes tests before the next; the auth removal and route additions are decoupled from the client refactor.

1. **Pure extraction (no behavior change):** `task-filters.ts`; refactor `TaskStore` to delegate to it. `store.test.ts` must stay green. *Independently shippable.*
2. **`api-client.ts` extraction + web rewire** to `createHttpClient` (still cookie-based, auth routes still present). Web build + web tests green. *Independently shippable.*
3. **Interface + adapters:** add `store-interface.ts`, `LocalStore`. No consumers yet. Compiles.
4. **Async-ify the shared layer:** make handlers + report/insights/stats/metrics `async` and `Store`-typed; wrap their callers (`server/routes.ts`, `end-day` command, tests) in `LocalStore`; add `await`s. Server still has PIN auth at this point — keep it, tests pass with `LocalStore`. *This is the big internal refactor; do it before touching auth so failures are isolated to async plumbing.*
5. **Remove PIN auth (doc 1a):** routes, `auth.ts` deletion, `serve.ts`, types (`server.pin`/`session_secret`), `server/index.ts` (`ensureSessionSecret`), web login screen, `server.test.ts` auth suite. Add `/api/store/*` group in the same step (it's the faithful surface RemoteStore will target). *Atomic within itself* — server contract changes here.
6. **RemoteStore + config + factory:** `remote-store.ts`, `client` config type/default, `login` command, `get-store.ts`. Add `remote-store.test.ts`. RemoteStore is testable in-process against the step-5 app.
7. **Wire clients:** `useTaskStore` + TUI mode read paths async; `mcp/src/tools.ts` `getStore()` + awaits; `useServerStatus` remote branch. This is the second big chunk (TUI async reads). Default config is `local`, so behavior is identical to today until the user opts into remote — **backward compatible**, matching doc 3c ("no config = local mode").

Steps 1-2 can land as independent PRs immediately. Steps 4 and 7 are the two large mechanical refactors; keep them as separate reviewable units. Nothing here requires the droplet/Cloudflare to exist — all of Phase 1 is testable locally against an in-process Hono app with a stubbed `tokenProvider`.

---

## 12. Open questions / risks — RESOLVED

Decisions locked with the product owner on 2026-06-30:

1. **Async Store / TUI scope: full scope.** Phase 1 includes both TUI and MCP going remote — the TUI async-read conversion (step 7) is in scope, not deferred.
2. **MCP auth mechanism: Cloudflare Access service token.** MCP (headless, no interactive login) authenticates via a non-expiring service token (`CF-Access-Client-Id` / `CF-Access-Client-Secret` headers), configured via `client.service_token_id` / `client.service_token_secret`. The TUI keeps the interactive user-JWT flow (`cloudflared access token`/`login`). `RemoteStore`'s `authHeaders` provider must support both: build it to send service-token headers when `service_token_id`/`service_token_secret` are configured, else fall back to the `cloudflared access token` JWT flow. This means `RemoteStoreOptions`/`tokenProvider` in §4 becomes an `authHeaders`-style provider with two concrete implementations (`serviceTokenAuth`, `cloudflaredJwtAuth`), selected by `get-store.ts` based on which config fields are present.
3. **`cf-access-token` header** — adopt as specified in F4; verify end-to-end once the droplet/Access app exist (Phase 3), no code changes anticipated.
4. **`/healthz` behind Access** — adopt the plan's recommendation: no bypass, ping with auth headers (service token for MCP context, JWT for TUI context).
5. **`client.mode` default** — adopt the plan's recommendation: default `local`, explicit opt-in required (`task-man config client.mode remote`), with a validity guard on the value.
6. **One-shot CLI commands stay local** — adopted as an explicit Phase 1.x follow-up, not in scope now.
7. **Web `session()` stub** — adopt the stub (`async () => true`) for a minimal Phase 1 diff; full `AuthGate`/identity work deferred to the "signed in as X" follow-up.

---

### Critical Files for Implementation
- `cli/src/store.ts` (source of the `Store` surface; refactor to `task-filters.ts`)
- `cli/src/server/routes.ts` (auth removal + new `/api/store/*` faithful-primitive group)
- `cli/src/remote-store.ts` (new; RemoteStore + CF Access token/retry logic — the highest-risk file)
- `cli/src/handlers/tasks.ts` (async/`Store` conversion that both server and MCP depend on)
- `mcp/src/tools.ts` and `cli/src/ui/hooks/useTaskStore.ts` (the two `getStore()` wiring points + TUI async-read conversion)
</content>
