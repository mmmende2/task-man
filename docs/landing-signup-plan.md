# Plan: Public landing page + approval-gated signup

## Context

Today the droplet stack is two containers (`task-man` + `cloudflared`) behind a
Cloudflare Tunnel; `tasks.<domain>` is gated by a Cloudflare Access application,
and the apex/root of the domain forwards to the GitHub Pages site. Goal:

1. A real public landing page for the product, replacing the gh-pages forward.
2. A signup flow — a visitor requests access, Mario approves, and the approved
   email can then log in through the existing Cloudflare Access gate.

Constraint: work with the current CF Access auth solution; preference for the
same droplet. The server side is already multi-user ready — `access-auth.ts`
resolves each Access JWT to an identity and `scoped-store.ts` gives every
identity its own namespace — so "signup" is purely an *edge admission* problem:
getting an email into the Access policy. No app-code data changes needed.

## Recommended shape

One new container on the existing droplet, one new public hostname on the
existing tunnel, and an Access Group as the approval switch.

```
                        ┌───────────────────────────────────────────┐
  visitor  ──HTTPS────▶│  Cloudflare edge                           │
                        │  <domain>, www.<domain>   → NO Access app │
                        │    (cache rules: static cached at edge)   │
  user     ──HTTPS────▶│  tasks.<domain>           → Access app    │
                        │    policy: group `task-man-users`         │
                        └───────────────┬───────────────────────────┘
                                        │ tunnel (outbound only)
                                        ▼
                 ┌──────────────────────────────────────────────────┐
                 │  Droplet — docker compose (internal network)     │
                 │   • cloudflared                                  │
                 │   • task-man   :3030  (unchanged)                │
                 │   • landing    :3040  ← NEW                      │
                 │       static landing page                        │
                 │       POST /api/signup  (Turnstile-verified)     │
                 │       GET  /api/signup/decide  (signed link)     │
                 │       volume: signups.json                       │
                 └──────────────────────────────────────────────────┘
```

Why this over the alternatives:

- **Same droplet, new container** (chosen): fits the existing pull-based deploy
  (CI → GHCR → droplet pulls), one more tunnel hostname, zero new
  infrastructure. The landing page is static and Cloudflare's CDN caches it at
  the edge, so the 1GB box sees almost no traffic for it.
- **Cloudflare Pages / Workers**: zero droplet load and free, but splits the
  deploy story into a second pipeline, and the signup backend would become a
  Worker + KV — more moving parts outside the repo's one-image discipline.
  Reasonable fallback if the droplet ever feels tight.
- **Serve landing from the task-man Hono server**: rejected. `tasks.<domain>`
  is Access-gated wall-to-wall; carving a public path out of it needs an Access
  bypass policy — a standing footgun that mixes public surface into the
  private API's hostname.
- **Second droplet**: unnecessary for a static page + one POST endpoint.

## The approval mechanism (how signup meets CF Access)

Cloudflare Access admits whoever the application policy includes. Today that
policy is "Emails include <mario>". Restructure once:

1. Zero Trust → Access → **Groups** → create `task-man-users`, seed it with
   Mario's email.
2. Edit the `task-man` Access application policy: Include → **Access group**
   `task-man-users` (drop the raw email rule).

"Approving a signup" is now exactly one operation: add the email to that group.
Two tiers, ship them in order:

- **v1 — manual**: the signup endpoint emails Mario (Resend, key already in
  hand) with the requester's email + note; Mario adds it to the group in the
  Zero Trust dashboard (~30s). Zero new credentials on the droplet.
- **v2 — one-click**: the notification email carries approve/deny links signed
  with an HMAC (single-use, 7-day expiry, decision + email in the payload).
  `GET /api/signup/decide?token=…` verifies the token, calls the Cloudflare API
  (`PUT accounts/{account_id}/access/groups/{group_id}`) to append the email,
  marks the request decided in `signups.json`, and sends the requester a
  welcome email pointing at `tasks.<domain>`. Only Mario's inbox receives the
  links, so possession of a valid token *is* the authorization — no separate
  admin login needed for a single-admin product.

Notes:
- New users authenticate via the already-enabled One-time PIN IdP — no
  passwords to manage. On first login the scoped store gives them an empty
  namespace automatically.
- Zero Trust free plan seats: 50 users. Fine for approval-gated early access;
  revisit if it ever grows past that.
- Removing a user later = remove from the group (dashboard or same API).

## Phase 1 — landing container

- New workspace `landing/` in the monorepo (joins `workspaces` in root
  `package.json`): a small Hono app serving `landing/public` (or a built static
  bundle — content out of scope here) plus the signup routes. Hono + Resend are
  already house dependencies.
- New `landing/Dockerfile` (or a second target in the root Dockerfile) →
  CI publishes `ghcr.io/mmmende2/task-man-landing` alongside the main image in
  `publish.yml`, same tag discipline (`:vX.Y.Z`, `:sha-<short>`, stamped).
- Compose: add a `landing` service on the internal network, **no ports**, with
  a named volume for `signups.json`. Same `TASK_MAN_TAG`-style pinned-tag rule.
- Tunnel (dashboard): add public hostnames `<domain>` and `www.<domain>` →
  `http://landing:3040`. Remove the gh-pages forwarding (whatever holds it —
  redirect rule or DNS record — dies here).
- **No Access application** on these hostnames — that's what makes them public.
- Cache Rule on `<domain>`: cache everything static, long edge TTL; bypass
  cache on `/api/*`.

## Phase 2 — Access group restructure

As above: create `task-man-users`, repoint the app policy at it. Verify Mario
can still log in before touching anything else. This is prerequisite plumbing
for both v1 and v2 approval.

## Phase 3 — signup endpoint (v1: notify + manual approve)

- `POST /api/signup` — body `{ email, name?, note? }`, zod-validated.
- **Turnstile** (Cloudflare's free CAPTCHA) on the form; endpoint verifies the
  Turnstile token server-side. Plus a Cloudflare **WAF rate-limiting rule** on
  `<domain>/api/signup` (e.g. 5/min/IP) so the box never sees a flood.
- Dedupe: if the email already has a pending/approved request, return the same
  "you're on the list" response (no account-enumeration signal).
- Append `{ email, name, note, ts, status: 'pending' }` to `signups.json`
  (atomic tmp-rename, same pattern as the task store); Resend email to Mario.

## Phase 4 — one-click approval (v2)

- Add signed approve/deny links to the notification email as described above.
- New env for the `landing` service:
  `SIGNUP_HMAC_SECRET`, `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_ACCESS_GROUP_ID`,
  `RESEND_API_KEY`, `SIGNUP_NOTIFY_TO`.
- Scope `CF_API_TOKEN` to *Account → Access: Organizations, Identity Providers,
  and Groups → Edit* on this account only — blast radius if the landing
  container is ever compromised is "can edit Access groups", nothing else.
  Note the group-update API is a full-replace `PUT`: read the group, append,
  write back.
- Idempotent decide: a replayed/expired token shows "already decided" /
  "expired", never double-adds.

## Verification checklist

- [ ] `curl -I https://<domain>` → 200, `cf-cache-status` present, **no** Access
      redirect.
- [ ] `curl -I https://tasks.<domain>/api/tasks` (no JWT) → still the Access
      challenge (regression check after policy repoint).
- [ ] Mario logs into `tasks.<domain>` post-group-migration.
- [ ] Signup with Turnstile passes; without → 4xx. Rate limit trips on a burst.
- [ ] Test email (a secondary address): signup → approve → OTP login →
      sees an *empty* task list (namespace isolation) → Mario's data untouched.
- [ ] Deny path + replayed approve link both behave.
- [ ] `signups.json` survives `docker compose down && up` (volume) and is
      included in the backup cron's tar.

## Out of scope / follow-ups

- Landing page content/design (explicitly deferred by Mario).
- Self-serve offboarding, seat management UI — dashboard is fine at this scale.
- Per-user service tokens for new users' MCP/TUI remote mode (`TASK_MAN_AGENTS`
  mapping is hand-edited env today; fine until there are real second users).
- SQLite for `signups.json` if volume ever matters (it won't for a while).
