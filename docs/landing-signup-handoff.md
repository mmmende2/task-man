# Handoff: implement the landing page + signup service

Implementation brief for an AI agent (or any engineer) working in this repo.
The architecture and its rationale live in
[`landing-signup-plan.md`](./landing-signup-plan.md) — read it first; this doc
is the *what to build*. Decisions there are settled: do not relitigate hosting
choice, hostname layout, or the Access-group approval mechanism.

## Mission

Add a new `landing/` workspace: a small public Hono service that serves the
product landing page and implements the signup flow (v1 notify + v2 one-click
approve), packaged as a second Docker image published by CI and wired into the
compose stack.

**In scope (code only):**
1. `landing/` workspace (Hono static server + signup API) with tests.
2. `landing/Dockerfile` + CI changes to publish `ghcr.io/mmmende2/task-man-landing`.
3. `deploy/docker-compose.yml`: new `landing` service.
4. A changeset (repo CI hard-fails without one).

**Out of scope — do NOT touch:**
- Anything under `cli/` or `web/` (the task-man server/app is unchanged; the
  multi-user scoping it needs already exists).
- Cloudflare dashboard work (tunnel hostnames, Access group, Turnstile site,
  WAF rules) and droplet operations — the operator does those; a checklist for
  them is at the bottom. Your code just consumes the resulting env vars.
- Landing page *content/design* — ship a minimal placeholder `index.html`
  containing the signup form wired to the API. Design comes later.

## Repo conventions you must follow

- **npm workspace**, one root lockfile. Add `"landing"` to `workspaces` in the
  root `package.json`. Package name: `task-man-landing`, `"private": true`.
  Run `npm install` at the **root** to update the single lockfile.
- **TypeScript + ESM**, Node 22. Mirror `cli/tsconfig.json` compiler settings.
- **Hono ^4 + @hono/node-server, zod ^3, resend ^4** — match the versions
  already in `cli/package.json`; don't introduce other frameworks.
- **Tests: vitest** (`"test": "vitest run"`). Test Hono routes in-process via
  `app.request(...)` — see `cli/src/__tests__/server.test.ts` for the house
  style. Wire the new workspace into the root `test` script (and `build`).
- **Validation**: zod schemas in their own module, unknown keys stripped,
  invalid input → 400 with a JSON error — copy the pattern from
  `cli/src/server/schemas.ts`.
- **Atomic file writes**: write tmp file then rename, same as
  `cli/src/store.ts` (`.tasks-*.tmp` → rename). Never write JSON in place.
- **Every PR needs a changeset** (`.changeset/`, CI job `changeset` enforces
  it). `task-man-landing` is not npm-published; check `.changeset/config.json`
  and add the package to `ignore` if the release flow shouldn't version it,
  then use an empty changeset — or a patch changeset on `task-man` if config
  requires one. Follow whatever the config supports; CI green is the test.
- Comments: sparse, and only for constraints the code can't express (read the
  existing Dockerfile for the house voice).

## Work item 1 — `landing/` workspace

```
landing/
  package.json          task-man-landing, private, scripts: build/test/dev
  tsconfig.json
  public/
    index.html          placeholder page + signup form + Turnstile widget
  src/
    index.ts            entry: createApp() + serve() on PORT (default 3040)
    app.ts              Hono app factory (exported for tests)
    schemas.ts          zod: SignupRequest { email, name?, note? }
    signup-store.ts     read/append/update signups.json (atomic, see conventions)
    turnstile.ts        server-side siteverify call
    notify.ts           Resend emails (owner notification, welcome)
    decide.ts           HMAC token mint/verify + Cloudflare group API (v2)
  src/__tests__/        vitest coverage per acceptance criteria below
```

### Routes

| Route | Behavior |
|---|---|
| `GET /healthz` | `{ ok: true, build: process.env.TASK_MAN_BUILD ?? 'dev' }` — compose healthcheck parity with the main image |
| `GET /*` | static from `public/` (`serveStatic`), `index.html` fallback |
| `POST /api/signup` | v1 flow, below |
| `GET /api/signup/decide` | v2 flow, below |

### `POST /api/signup` (v1)

1. Parse body with zod (`email` required + format-checked, `name`/`note`
   optional, length-capped). Invalid → 400.
2. Verify the Turnstile token (`cf-turnstile-response` field) against
   `https://challenges.cloudflare.com/turnstile/v0/siteverify` with
   `TURNSTILE_SECRET_KEY`. Fail → 403. **If the env var is unset, skip
   verification and log one startup warning** — that's local-dev mode.
3. Dedupe: if the email already has a record in any status, return the exact
   same 200 body as a fresh signup ("you're on the list") — responses must not
   reveal whether an email is known (no enumeration oracle).
4. Append `{ id, email, name, note, ts, status: 'pending' }` to
   `signups.json` in `LANDING_DATA_DIR` (default `~/.task-man-landing`).
5. Email `SIGNUP_NOTIFY_TO` via Resend: requester details + (v2, when
   configured) approve/deny links. Resend failure → still 200 to the visitor,
   error logged (the record is safely on disk; the operator can re-process).

### `GET /api/signup/decide?token=…` (v2)

Token: HMAC-SHA256 (`SIGNUP_HMAC_SECRET`) over a payload of
`{ id, email, decision: 'approve' | 'deny', exp }` (7-day expiry), encoded
base64url, minted in the notification email. Handler:

1. Verify signature + expiry → otherwise a plain-HTML "link invalid/expired".
2. Load the record by `id`; if status is no longer `pending` → "already
   decided" page, **no side effects** (single-use / replay-safe).
3. Approve: Cloudflare API — `GET /accounts/{CF_ACCOUNT_ID}/access/groups/{CF_ACCESS_GROUP_ID}`,
   append `{ email: { email } }` to the `include` array, `PUT` the group back
   (the API is full-replace; never PUT a constructed-from-scratch body). Auth:
   `Authorization: Bearer ${CF_API_TOKEN}`. Then send the requester a welcome
   email pointing at `PRODUCT_URL`, and set status `approved`.
4. Deny: set status `denied`, no API call, no email to the requester.
5. **Degraded mode**: if any of `CF_API_TOKEN` / `CF_ACCOUNT_ID` /
   `CF_ACCESS_GROUP_ID` / `SIGNUP_HMAC_SECRET` is unset, the service runs
   v1-only — notification emails omit the links, `/api/signup/decide` returns
   404, startup logs which mode is active. All-or-nothing on that env group;
   partial config → fail startup with a clear message.

### Env contract (all consumed here, none new to other services)

| Var | Required | Purpose |
|---|---|---|
| `PORT` | no (3040) | listen port |
| `LANDING_DATA_DIR` | no (`~/.task-man-landing`) | `signups.json` location |
| `RESEND_API_KEY` | v1 | outbound email |
| `SIGNUP_NOTIFY_TO` | v1 | operator's address |
| `PRODUCT_URL` | v1 | e.g. `https://tasks.example.com`, used in welcome email |
| `TURNSTILE_SECRET_KEY` | prod | server-side CAPTCHA check (unset = dev mode) |
| `TURNSTILE_SITE_KEY` | prod | injected into the form page |
| `SIGNUP_HMAC_SECRET` | v2 | decide-link signing |
| `CF_API_TOKEN` | v2 | scoped: Account → Access Groups → Edit |
| `CF_ACCOUNT_ID`, `CF_ACCESS_GROUP_ID` | v2 | group to mutate |

## Work item 2 — Docker image

`landing/Dockerfile`, build context = **repo root** (workspace install needs
the root lockfile): `docker build -f landing/Dockerfile .`. Follow the root
`Dockerfile`'s structure — deps layer before source, multi-stage, slim runtime,
`ARG GIT_DESCRIBE` → `ENV TASK_MAN_BUILD` stamped last. Keep the image lean:
install only what `task-man-landing` needs (workspace-filtered install or
prune), not cli/web's tree. `EXPOSE 3040`, CMD runs the built entry.

## Work item 3 — CI publish

In `.github/workflows/publish.yml`, publish the second image alongside the
first: reuse the existing `meta` step's describe/tag computation but with
`IMAGE=ghcr.io/mmmende2/task-man-landing` for the tag list (same tag scheme:
`latest`+`sha-*`+describe on main, `vX.Y.Z` on tag push), and add a second
`docker/build-push-action` step with `file: landing/Dockerfile`, same
`GIT_DESCRIBE` build-arg, gha cache, and the same `no-cache-filters: runtime`
guard (same stamp-inheritance hazard, same reason — the comment in the
workflow explains it).

## Work item 4 — compose

Add to `deploy/docker-compose.yml`, matching the existing service's
conventions (pinned `${TASK_MAN_TAG:?…}` tag — same var, images release in
lockstep; `restart: unless-stopped`; `internal` network; **no `ports:`**):

```yaml
landing:
  image: ghcr.io/mmmende2/task-man-landing:${TASK_MAN_TAG:?...}
  restart: unless-stopped
  environment:
    - RESEND_API_KEY=${RESEND_API_KEY}
    - SIGNUP_NOTIFY_TO=${SIGNUP_NOTIFY_TO}
    - PRODUCT_URL=${PRODUCT_URL}
    - TURNSTILE_SECRET_KEY=${TURNSTILE_SECRET_KEY}
    - TURNSTILE_SITE_KEY=${TURNSTILE_SITE_KEY}
    - SIGNUP_HMAC_SECRET=${SIGNUP_HMAC_SECRET}
    - CF_API_TOKEN=${CF_API_TOKEN}
    - CF_ACCOUNT_ID=${CF_ACCOUNT_ID}
    - CF_ACCESS_GROUP_ID=${CF_ACCESS_GROUP_ID}
  volumes:
    - landing-data:/root/.task-man-landing
  networks:
    - internal
```

Plus `landing-data` under top-level `volumes:`. cloudflared reaches it as
`landing:3040`; nothing else changes.

## Acceptance criteria (definition of done)

From a clean checkout, all of these pass:

- [ ] `npm install && npm run build && npm test` at root — green, including the
      new workspace's tests.
- [ ] Tests cover: zod rejection (bad email, oversized note → 400); dedupe
      returns byte-identical 200 for repeat email; Turnstile dev-mode skip and
      prod-mode 403 (fetch mocked); signup record lands in a tmp
      `LANDING_DATA_DIR` with `status: 'pending'`; decide with valid token
      approves once and replays as "already decided" with **no second CF API
      call** (fetch mocked, call count asserted); expired/garbage token → no
      side effects; degraded mode (v2 env absent) → decide 404s and
      notification omits links; partial v2 env → startup throws.
- [ ] Resend and Cloudflare API are **always mocked** in tests — zero network.
- [ ] `docker build -f landing/Dockerfile .` succeeds; `docker run -p 3040:3040
      <img>` serves `/healthz` and the placeholder page; container runs with
      **no env at all** (dev mode) without crashing.
- [ ] `git grep -l task-man-landing` shows publish.yml + compose wired up.
- [ ] A changeset exists and `npx changeset status --since=origin/main` passes.
- [ ] Nothing under `cli/` or `web/` modified (`git status` proves it).

## Operator checklist (Mario — after merge, not the agent)

Dashboard/droplet steps, in order; the plan doc has details:

1. Turnstile: Cloudflare → Turnstile → add site for `<domain>` → note
   site key + secret.
2. Zero Trust → Access → Groups: create `task-man-users` with your email;
   repoint the `task-man` app policy to the group; verify you can still log in.
3. API token (v2): My Profile → API Tokens → custom, *Account → Access:
   Organizations, Identity Providers, and Groups → Edit*, this account only.
   Group ID is in the group's URL/API listing.
4. Tunnel: add public hostnames `<domain>` + `www.<domain>` →
   `http://landing:3040`. Remove the GitHub Pages forwarding. **No Access app**
   on these hostnames.
5. WAF rate-limiting rule: `<domain>/api/signup`, ~5 req/min/IP. Cache rule:
   cache static, bypass `/api/*`.
6. Droplet `.env`: add the env-contract vars; `docker compose pull && up -d`
   with the release `TASK_MAN_TAG`.
7. Run the verification checklist at the end of `landing-signup-plan.md`
   (includes the second-email namespace-isolation test).
