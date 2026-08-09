---
---

**Landing:** a failed signup no longer locks the visitor out of retrying.

Turnstile tokens are single-use — siteverify redeems one on every attempt. The
form reset its widget after a success but not after a rejection, so the retry
it re-enabled resubmitted the spent token, Cloudflare rejected it as
`timeout-or-duplicate`, and every further attempt failed the same way until the
visitor reloaded the page.

The widget now resets on the rejection and network-error paths too. The
`turnstile.render()` call also passes `action: 'turnstile-spin-v2'`, the
explicit-render equivalent of the declarative widget's `data-action`.
