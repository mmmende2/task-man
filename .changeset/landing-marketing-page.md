---
---

**Landing:** the public page now sells the product instead of only collecting signups.

The page carried a heading, two sentences, and the signup form. It replaced the
gh-pages forward as the front door without inheriting the README's pitch.

- **The README's case, restructured.** Three surfaces, the TUI and phone
  screenshots, and how the hosted path works, on the web app's Outrun palette —
  same wordmark, sticky top bar, and form styling, so the page and the app read
  as one product. Signup is unchanged, anchored at `#signup`.
- **`/api/config` also returns `productUrl`.** Feeds the "Open the app" links
  from the `PRODUCT_URL` env var rather than a hardcoded domain. Unset, the
  links stay out of the page instead of pointing nowhere.
