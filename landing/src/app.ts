import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { HTTPException } from 'hono/http-exception';
import type { LandingEnv } from './env.js';
import { signupRequestSchema, validationMessage } from './schemas.js';
import { SignupStore, type SignupRecord } from './signup-store.js';
import { verifyTurnstile } from './turnstile.js';
import { sendSignupNotification, sendWelcomeEmail, type DecideLinks } from './notify.js';
import { addEmailToAccessGroup, decideExpiry, mintDecideToken, verifyDecideToken } from './decide.js';

/** public/ sits next to dist/ (published layout) and next to src/ (dev/test). */
export function resolvePublicRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'public');
}

function buildDecideLinks(origin: string, record: SignupRecord, secret: string): DecideLinks {
  const exp = decideExpiry();
  const approveToken = mintDecideToken({ id: record.id, email: record.email, decision: 'approve', exp }, secret);
  const denyToken = mintDecideToken({ id: record.id, email: record.email, decision: 'deny', exp }, secret);
  return {
    approveUrl: `${origin}/api/signup/decide?token=${encodeURIComponent(approveToken)}`,
    denyUrl: `${origin}/api/signup/decide?token=${encodeURIComponent(denyToken)}`,
  };
}

function decidePage(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>task-man signup</title></head>` +
    `<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem;">` +
    `<p>${message}</p></body></html>`;
}

export interface CreateAppOptions {
  publicRoot?: string;
}

export function createApp(env: LandingEnv, opts: CreateAppOptions = {}): Hono {
  const publicRoot = opts.publicRoot ?? resolvePublicRoot();
  const signupStore = new SignupStore(join(env.dataDir, 'signups.json'));

  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error('[landing] unhandled error:', err);
    return c.json({ error: err.message || 'error' }, 500);
  });

  app.get('/healthz', (c) => c.json({ ok: true, build: process.env.TASK_MAN_BUILD ?? 'dev', time: new Date().toISOString() }));

  // Both values are public by construction — the Turnstile site key is
  // embedded in page HTML on every Turnstile-protected site, and productUrl is
  // the hostname visitors are being invited to — so this stays
  // unauthenticated. `null` on either tells the front end to leave that piece
  // out: no site key means no widget (dev mode), no product URL means the
  // "Open the app" links stay hidden rather than pointing nowhere.
  app.get('/api/config', (c) =>
    c.json({ turnstileSiteKey: env.turnstileSiteKey, productUrl: env.productUrl }),
  );

  app.post('/api/signup', async (c) => {
    const json = await c.req.json().catch(() => ({}));
    const parsed = signupRequestSchema.safeParse(json);
    if (!parsed.success) {
      throw new HTTPException(400, { message: validationMessage(parsed.error) });
    }
    const { email, name, note, turnstileToken } = parsed.data;

    const turnstile = await verifyTurnstile(turnstileToken, env.turnstileSecretKey, c.req.header('cf-connecting-ip'));
    if (!turnstile.ok) {
      throw new HTTPException(403, { message: 'Verification failed — please try again.' });
    }

    // Dedupe on email; the response is identical whether this is a fresh
    // signup or a repeat, so nothing here signals to the client whether an
    // email is already known.
    const existing = await signupStore.findByEmail(email);
    const record = existing ?? (await signupStore.append({ email, name: name ?? null, note: note ?? null }));

    if (!existing && env.emailEnabled) {
      // The link origin comes from configured LANDING_PUBLIC_URL, not the
      // request's Host header — a spoofed Host must not be able to steer a
      // single-use approve/deny token into an attacker-controlled origin.
      const links = env.v2Enabled ? buildDecideLinks(env.landingPublicUrl!, record, env.signupHmacSecret!) : null;
      try {
        await sendSignupNotification(env.resendApiKey!, env.signupNotifyTo!, record, links);
      } catch (err) {
        // The record is safely on disk either way; a failed notification
        // doesn't fail the visitor's request, and the operator can catch up
        // by checking signups.json.
        console.error('[landing] failed to send signup notification:', err);
      }
    }

    return c.json({ ok: true, message: "Thanks — you're on the list. We'll email you when you're approved." });
  });

  app.get('/api/signup/decide', async (c) => {
    if (!env.v2Enabled) {
      return c.html(decidePage('One-click approval is not enabled on this deployment.'), 404);
    }
    const token = c.req.query('token');
    const payload = token ? verifyDecideToken(token, env.signupHmacSecret!) : null;
    if (!payload) {
      return c.html(decidePage('This link is invalid or has expired.'), 400);
    }

    const record = await signupStore.findById(payload.id);
    if (!record) {
      return c.html(decidePage('This signup request no longer exists.'), 404);
    }
    // Already decided: no side effects, no repeated Cloudflare/email calls —
    // this is what makes the link single-use / replay-safe.
    if (record.status !== 'pending') {
      return c.html(decidePage(`This request was already ${record.status}.`));
    }

    if (payload.decision === 'deny') {
      await signupStore.updateStatus(record.id, 'denied');
      return c.html(decidePage(`Denied ${record.email}.`));
    }

    try {
      await addEmailToAccessGroup(
        { apiToken: env.cfApiToken!, accountId: env.cfAccountId!, groupId: env.cfAccessGroupId! },
        record.email,
      );
    } catch (err) {
      console.error('[landing] failed to update Cloudflare Access group:', err);
      return c.html(
        decidePage('Approval failed while updating Cloudflare Access. Try again, or add the email manually.'),
        502,
      );
    }

    await signupStore.updateStatus(record.id, 'approved');

    if (env.emailEnabled && env.productUrl) {
      try {
        await sendWelcomeEmail(env.resendApiKey!, record.email, env.productUrl);
      } catch (err) {
        console.error('[landing] failed to send welcome email:', err);
      }
    }

    return c.html(decidePage(`Approved ${record.email}.`));
  });

  // Static landing page, with an index.html fallback for any path that
  // doesn't match a real file.
  app.use('/*', serveStatic({ root: publicRoot }));
  app.get('/*', serveStatic({ root: publicRoot, path: 'index.html' }));

  return app;
}
