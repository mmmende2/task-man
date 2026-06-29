Quick checklist — first time setup, then the runtime loop.

**One-time build** (from `task-man/`):

```bash
cd cli
npm run build:all   # tsc + vite build + copies web/dist → cli/dist-web
```

Verify `cli/dist-web/index.html` exists. If you ever forget to rebuild web, `task-man serve` returns a 503 with a "frontend not built" message instead of pretending it's fine.

**Set the PIN** (one-time per machine):

```bash
task-man serve --set-pin
# Set a 4-digit web PIN: 4242
# ✓ Web PIN set.
```

This goes through a dedicated path so leading zeros survive (`0042` stays `0042`). Don't use `task-man config server.pin 4242` — that'd coerce it to a number.

**Start the server:**

```bash
task-man serve
```

It prints something like:

```
  task-man web  (bind 0.0.0.0:3030)

  Reach it from this or another device on the wifi:
    http://Marios-MacBook-Pro.local:3030
    http://192.168.1.42:3030

  Enter your PIN on first visit. Ctrl-C to stop.
```

**Test from the laptop running the server:** open `http://localhost:3030` in a browser. Enter PIN → land on Focus view. Tap `+ Capture`, type `test from web -c misc -p high`, submit. Within ~2s the task appears in the TUI's polling refresh too.

**Test from a phone** (same wifi):

1. Open one of the printed URLs. The `.local` one works on iOS/macOS/Android by default; corporate or some Windows networks don't resolve mDNS — use the raw `192.168.x.x` URL in that case.
2. Enter the PIN. Cookie persists 30 days, so this is once per device.
3. iOS Safari: **Share → Add to Home Screen** (Android Chrome: **⋮ → Install app**) to get the PWA shell. Service worker caches HTML/JS/CSS only; task data is always fresh from the server.

**Stop the server:** `Ctrl-C` in the terminal running it — cleans up the pidfile and the TUI's `● web :3030` footer indicator disappears.

**Confirm the LAN gate** (quick paranoia check):

```bash
# from phone or another laptop — request without the cookie:
curl -i http://<host>.local:3030/api/tasks      # expect 401

# wrong PIN 6× in a row hits rate-limit:
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    http://<host>.local:3030/api/auth/login \
    -H 'content-type: application/json' -d '{"pin":"0000"}'
done
# expect: 401 401 401 401 401 429
```

**Lock down to local-only** (e.g. on an untrusted wifi):

```bash
task-man serve --bind 127.0.0.1
```

Then only `http://localhost:3030` reaches it — no phone access.

**Frontend dev loop** (you almost certainly won't need this, but for completeness): run the API and web separately so you get HMR.

```bash
# terminal 1
task-man serve         # API on :3030

# terminal 2
cd web && npm run dev  # Vite on :5173, proxies /api → :3030
```

Open `http://localhost:5173`.

**Things that can bite:**

- *Forgot the PIN.* Re-run `task-man serve --set-pin` — it overwrites.
- *Phone can't resolve `<host>.local`.* Use the raw IP URL the server also prints.
- *Port 3030 in use.* `task-man serve --port 3099`.
- *Stale pidfile* (server crashed, didn't clean up). Footer keeps showing `● web :3030` for up to 5s, then the next probe finds the dead PID via `kill(pid, 0)` and it disappears. If it doesn't, `rm ~/.task-man/server.pid`.
