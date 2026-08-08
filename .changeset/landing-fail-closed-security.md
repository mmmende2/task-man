---
---

`landing` now fails startup instead of silently degrading on two public-deployment
risks flagged in security review.

- **CAPTCHA is required.** A missing or partial `TURNSTILE_SECRET_KEY`/`TURNSTILE_SITE_KEY`
  pair throws at startup; running without it now needs an explicit
  `SIGNUP_ALLOW_NO_CAPTCHA=1` (dev only — the deploy compose doesn't set it).
- **Approve/deny link origin is configured, not derived from the request.** A new
  `LANDING_PUBLIC_URL` var joins the one-click-approval env group; decide links
  are built from it instead of the request's `Host` header, closing a
  host-header-spoofing path to a stolen approval token.

Droplet `.env` needs `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`, and
`LANDING_PUBLIC_URL` set before the next deploy.
