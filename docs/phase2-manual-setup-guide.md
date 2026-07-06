# Phase 2/3 Manual Setup Guide — DigitalOcean + Cloudflare

This is a click-by-click runbook for the parts of the task-man deploy that only you
can do (accounts, dashboards, DNS, secrets). It assumes Phase 1 (the code refactor —
`Store`/`RemoteStore`/`getStore()`/`task-man login`) is already merged, which it is.

Read `deploy-plan.md` first if you want the "why" behind these choices — this doc is
just the "how, step by step."

Where a step needs a config file (docker-compose, Dockerfile, systemd unit), I'll
generate it for you when you get there — flagged with **[I generate this]**. Don't
write those by hand.

---

## 0. Before you start

Checklist of things to have ready:

- [ ] A domain name you control (or are willing to buy). If you don't have one yet,
      any registrar works — Cloudflare itself sells domains at cost with no markup,
      which is the simplest option since you're moving it to Cloudflare anyway.
- [ ] A credit card for DigitalOcean ($6/mo) and Cloudflare (free tier covers
      everything below — Tunnel, Access for up to 50 users, and DNS are all free).
- [ ] An SSH key pair on your laptop. Check with `ls ~/.ssh/id_ed25519.pub`. If it
      doesn't exist: `ssh-keygen -t ed25519 -C "your-email"`.

---

## 1. DigitalOcean: create the droplet

### 1a. Account + project

1. Sign up at digitalocean.com (or log in).
2. In the left sidebar, **Projects** → create a new project called `task-man` (or
   reuse an existing personal-infra project if you have one — DO projects are just
   labels for billing/organization, not isolation boundaries, so this is a style
   choice, not a security one).

### 1b. Create the droplet

**Create** (top right) → **Droplets**.

| Option | What to pick | Why |
|---|---|---|
| Region | Whichever is geographically closest to you | Lowest latency for the TUI/web round-trip |
| Image | **Ubuntu 24.04 (LTS) x64** | Long support window, everything below assumes it |
| Droplet type | **Basic** → **Regular SSD**, the cheapest tier (~$6/mo, 1 GB RAM / 1 vCPU) | This workload is a single Node process serving one user — no need to pay for more |
| Authentication | **SSH Key** — click "New SSH Key", paste the contents of `~/.ssh/id_ed25519.pub` | Never pick "Password" — key auth is materially safer and DO makes key auth free/easy |
| Hostname | `task-man-01` or similar | Doesn't matter functionally |
| Backups (DO's own, not the app-level ones in step 5) | Leave **off** for now | It's $1.20/mo for weekly droplet-image snapshots — nice-to-have, not required since app data is backed up separately (step 5). Turn on later if you want belt-and-suspenders. |

Click **Create Droplet**. Note the public IP it's assigned — you'll SSH to it once,
then never need the IP again once the Tunnel is live (Tunnel is outbound-only).

### 1c. First login and lockdown

SSH in as root once to harden it:

```
ssh root@<droplet-ip>
```

On the droplet:

```bash
# Create a non-root user
adduser mario
usermod -aG sudo mario

# Copy your SSH key to the new user
rsync --archive --chown=mario:mario ~/.ssh /home/mario

# Firewall: deny everything inbound except SSH.
# (Tunnel is outbound-only, so no 80/443 rule needed — this is the whole
# point of using a Tunnel instead of a reverse proxy with open ports.)
ufw allow OpenSSH
ufw enable

# Disable root login and password auth over SSH
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

From now on, SSH in as `ssh mario@<droplet-ip>`, not root.

### 1d. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker mario
```

Log out and back in for the group change to take effect. Verify: `docker compose version`.

---

## 2. Cloudflare: domain, Tunnel, Access

### 2a. Move the domain to Cloudflare

1. Cloudflare dashboard → **Add a domain** → enter your domain.
2. Pick the **Free** plan.
3. Cloudflare shows you two nameservers (e.g. `xxx.ns.cloudflare.com`). Go to
   your registrar's dashboard and replace the existing nameservers with these two.
   - If you bought the domain through Cloudflare Registrar, this step is automatic.
4. Wait for the "Active" status on the domain in Cloudflare (can take a few minutes
   to a few hours depending on the registrar/DNS propagation).

**What to look for**: don't create any A/CNAME records yet for the tunnel hostname —
the Tunnel setup in 2b creates that DNS record for you automatically.

### 2b. Create the Tunnel

1. Cloudflare dashboard → left sidebar **Zero Trust** (may prompt you to set up a
   free Zero Trust org name the first time — any name works, it's just a namespace).
2. **Networks** → **Tunnels** → **Create a tunnel**.
3. Connector type: **Cloudflared**.
4. Name it `task-man`.
5. It shows an install command with a token embedded, like:
   ```
   cloudflared service install eyJhIjoi...
   ```
   **Don't run this on the droplet.** You just need the token — copy it (it's the
   long string after `service install`). This is your `TUNNEL_TOKEN`.
6. Click **Next**. On the "Public Hostname" screen:
   - Subdomain: `tasks` (or whatever you want — e.g. `tasks.yourdomain.com`)
   - Domain: pick your domain from the dropdown
   - Type: **HTTP**
   - URL: `task-man:3030` — this is the Docker service name + port, resolved
     inside the compose network (set up in step 3), not the droplet's IP.
7. Click **Save tunnel**.

This automatically creates the DNS record — you don't need to touch the DNS tab.

### 2c. Lock it down with Access

This is the actual auth for your app — it replaces the old PIN entirely.

1. Zero Trust → **Access** → **Applications** → **Add an application** →
   **Self-hosted**.
2. Application name: `task-man`.
3. Session duration: **24 hours** (or longer, e.g. `7 days`) — this is how often
   you'll be prompted to re-auth. Since you're the only user, favor convenience;
   shorten this later if you ever add other users or a shared/untrusted device.
4. Application domain: pick `tasks.yourdomain.com` (must match the tunnel hostname
   from 2b exactly).
5. **Identity providers**: leave "One-time PIN" (email code) enabled unless you
   want to wire up Google/GitHub login — for a single-user personal tool, email OTP
   is the simplest option and requires no extra setup.
6. Next → **Policies** → **Add a policy**:
   - Policy name: `owner-only`
   - Action: **Allow**
   - Include rule: **Emails** → enter your email (`you@example.com`)
7. Save. Skip the optional "App Launcher" toggle — not needed for a single personal app.

**What this buys you**: hitting `https://tasks.yourdomain.com` from a browser now
shows a Cloudflare-branded login page requiring an email code sent to you, before
it ever reaches the droplet. Hitting it without that gets an HTML challenge page,
not your app — that's expected and correct (see verification checklist, step 6).

### 2d. Proxy status

Leave the DNS record's proxy toggle **on** (orange cloud) — this is the default
when Tunnel creates the record. This gives you Cloudflare's CDN/DDoS protection in
front of the tunnel. No action needed unless you notice it's grey (proxy off);
if so, flip it to orange in Cloudflare → DNS → Records.

---

## 3. Deploy the app to the droplet

`cli/Dockerfile` and `deploy/docker-compose.yml` already exist in the repo — no
npm registry involved (task-man isn't published there), the image builds
straight from a checkout of the repo.

1. On the droplet, clone the repo:
   ```bash
   sudo mkdir -p /opt/task-man && sudo chown mario:mario /opt/task-man
   git clone https://github.com/mmmende2/task-man.git /opt/task-man/src
   cd /opt/task-man/src
   ```
2. Pin to a specific **immutable version tag** rather than tracking a branch —
   this is the "never `@latest`" guardrail from the deploy plan, adapted to a
   build-from-source setup. The tag names track the app version in
   `cli/package.json` (`v0.2.0`, `v0.2.1`, …) and are **never moved or reused** —
   each release gets its own, so `git tag` is a permanent record of what shipped
   and rollback is just checking out an older one. From your laptop, cut the tag
   first (see "Release tagging" below), then on the droplet:
   ```bash
   git fetch --tags
   git checkout v0.2.0   # the version you want live
   ```
3. `cp deploy/.env.example deploy/.env` and fill in:
   ```
   TUNNEL_TOKEN=<the token from step 2b>
   CF_ACCESS_TEAM_DOMAIN=<your team domain, e.g. "myteam" — Zero Trust → Settings>
   CF_ACCESS_AUD=<Access → Applications → task-man → Overview → "Application Audience (AUD) Tag">
   TASK_MAN_DEFAULT_OWNER=<your Access login email>
   TASK_MAN_AGENTS=<service token common name>=<your email>
   TZ=<your IANA timezone, e.g. America/Denver>
   ```
   The `CF_ACCESS_*` pair makes the server verify Cloudflare's Access JWT on
   every API request itself, instead of trusting that only the tunnel can
   reach it. Set both or neither — the server refuses to start on a partial pair.

   The `TASK_MAN_*` pair drives authorization (each identity sees only its own
   tasks once auth is on). `TASK_MAN_DEFAULT_OWNER` is who owns every task
   created before this layer existed — set it to *your* login email or your
   existing tasks are invisible. `TASK_MAN_AGENTS` maps the MCP service token
   to you: the common name is the token's "Client ID" name shown at Zero Trust
   → Access → Service Auth → Service Tokens (looks like `<name>.<team>.access`).
   Leave it unmapped and MCP calls get 403.

   `TZ` makes the server's idea of "today" match yours. Containers default
   to UTC, so without it evening completions fall on tomorrow's date and
   disappear from the web Metrics page until UTC midnight passes.
4. `docker compose -f deploy/docker-compose.yml up -d --build`.
5. `docker compose -f deploy/docker-compose.yml logs -f` — look for `cloudflared`
   logging a successful connection ("Registered tunnel connection") and
   `task-man` logging that it's listening on port 3030. Ctrl-C to stop tailing
   (containers keep running).

### Release tagging (immutable, versioned)

Deploys are pinned to immutable tags named after the app version — one new tag
per release, **never moved, never reused**. This keeps a permanent record of
what shipped and makes rollback trivial.

**Cut a release (laptop):**
```bash
# bump "version" in cli/package.json to match (e.g. 0.2.0 → 0.2.1), commit it
git tag v0.2.1 main
git push origin main v0.2.1
```

**Redeploy on the droplet** — check out the specific version:
```bash
git fetch --tags
git checkout v0.2.1
docker compose -f deploy/docker-compose.yml up -d --build
```
Prefer one command without remembering the name? Check out the highest version
tag automatically:
```bash
git fetch --tags
git checkout "$(git tag -l 'v*' --sort=-v:refname | head -1)"
docker compose -f deploy/docker-compose.yml up -d --build
```

**Roll back** to a previous release the same way — the old code is still there
under its own tag, so `git checkout v0.2.0 && docker compose … up -d --build`
puts it back. No `--force` anywhere: immutable tags are only ever *added* on
`git fetch --tags`, never rewritten.

### 3a. Seed the droplet with your current data

One-time copy of your laptop's task file so the server doesn't start empty:

```bash
scp ~/.task-man/tasks.json mario@<droplet-ip>:/tmp/tasks.json
ssh mario@<droplet-ip> "docker compose -f /opt/task-man/src/deploy/docker-compose.yml cp /tmp/tasks.json task-man:/root/.task-man/tasks.json"
```

---

## 4. DO Spaces backups

1. DigitalOcean dashboard → **Spaces Object Storage** → **Create a Space**.
2. Region: same as your droplet (keeps transfer free/fast).
3. Name: `task-man-backups` (must be globally unique — DO will tell you if taken).
4. File Listing: **Restrict File Listing** (private) — no reason for this to be public.
5. **API** (left sidebar under Spaces, or account **API** → **Spaces Keys**) →
   **Generate New Key**. Save the access key + secret shown once.

On the droplet:

```bash
sudo apt install -y rclone
rclone config
```

In the `rclone config` wizard: `n` (new remote) → name it `spaces` → type `s3` →
provider `DigitalOcean Spaces` → paste access key/secret → region matches your
Space → endpoint is shown on the Space's dashboard (e.g. `nyc3.digitaloceanspaces.com`).

Then add the nightly cron (`crontab -e` as the `mario` user, or root — either
works as long as it can read `/var/lib/task-man`):

```
0 4 * * * tar -czf - /var/lib/task-man | rclone rcat spaces:task-man-backups/$(date -I).tar.gz
```

**What to check**: after 24h, or by running the tar/rclone command manually once,
confirm a dated `.tar.gz` shows up in the Space's file browser in the DO dashboard.

Retention (optional, add as a second weekly cron line): delete objects older than
30 days via `rclone delete --min-age 30d spaces:task-man-backups/`.

---

## 5. Your laptop: point the client at the server

```bash
brew install cloudflared
task-man config client.remote_url https://tasks.yourdomain.com
task-man login
```

`task-man login` shells out to `cloudflared access login`, which opens your browser
to the Cloudflare Access page from step 2c — enter the email code, and it caches a
JWT locally (`~/.cloudflared/`) that auto-refreshes.

```bash
task-man config client.mode remote
```

From here, the TUI and MCP both read/write through `https://tasks.yourdomain.com`
instead of the local file.

---

## 6. Verification checklist

Work through these in order — each one isolates a different layer, so if
something's broken this tells you where:

- [ ] **DNS**: `dig tasks.yourdomain.com` resolves to a Cloudflare IP (104.x/172.x range).
- [ ] **Access gate (unauthenticated)**: `curl -i https://tasks.yourdomain.com/api/tasks`
      → expect an HTML challenge page, NOT a 200 with JSON. If you get JSON back
      unauthenticated, the Access application isn't actually covering that hostname —
      go back to step 2c and check the "Application domain" matches exactly.
- [ ] **Access gate (authenticated)**:
      `curl -i -H "cf-access-token: $(cloudflared access token --app=https://tasks.yourdomain.com)" https://tasks.yourdomain.com/api/tasks`
      → expect `200` + JSON array.
- [ ] **Web UI**: visit the URL in a browser → CF Access email-code prompt → app loads.
- [ ] **TUI remote**: launch `task-man`, create a task, refresh the browser, confirm it appears.
- [ ] **TUI local fallback**: `task-man config client.mode local` → confirm the
      TUI now shows your laptop's local file (should differ from server state
      unless freshly seeded). Switch back to `remote` and confirm round-trip works again.
- [ ] **MCP**: from a Claude Code session, add a task via the task-man MCP tool,
      confirm it shows up in both the TUI and the browser.
- [ ] **Restart resilience**: `docker compose restart task-man` on the droplet →
      data still present, TUI reconnects without you doing anything.
- [ ] **Backup restore drill**: download one of the `.tar.gz` backups, extract it
      somewhere, confirm `tasks.json` inside is valid/readable. (Don't need to
      actually overwrite the live volume — just confirm the backup isn't corrupt.)

---

## Notes for future projects on this same infrastructure

You now have a reusable pattern for any future personal tool:

- **One droplet, many services.** Adding a second app later is: one more
  container in the compose file, one more public hostname on the same Tunnel
  (step 2b's "Public Hostname" screen, "Add a public hostname"), one more Access
  application if it needs its own auth policy. No new droplet, no new open ports.
- **Coolify** is worth a look if you end up wanting a UI for managing multiple
  apps/deploys instead of hand-editing compose files over SSH — it self-hosts on
  the same droplet and sits comfortably behind the same Tunnel. Not needed for
  task-man alone; consider it once you have 2-3 services.
- **Cloudflare Access policies scale by email/group**, not by app — if you want
  to eventually share a project with someone else, it's a policy edit in step 2c,
  not an infrastructure change.
- **DO Spaces backups are S3-compatible** — the same `rclone` config from step 4
  works for any other app's backups, just a different bucket.
