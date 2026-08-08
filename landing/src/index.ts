import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadEnv } from './env.js';

const env = loadEnv();

if (!env.turnstileEnabled) {
  console.warn('[landing] SIGNUP_ALLOW_NO_CAPTCHA=1 — CAPTCHA verification is explicitly disabled (dev mode).');
}
if (!env.emailEnabled) {
  console.warn('[landing] RESEND_API_KEY/SIGNUP_NOTIFY_TO/PRODUCT_URL not set — signup notifications are disabled (dev mode).');
}
if (!env.v2Enabled) {
  console.warn('[landing] One-click approval env not set — notifications will omit approve/deny links (v1, manual approval only).');
}

const app = createApp(env);

serve({ fetch: app.fetch, port: env.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[landing] listening on http://0.0.0.0:${info.port}`);
});
