import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../app.js';
import { loadEnv, type LandingEnv } from '../env.js';
import { decideExpiry, mintDecideToken } from '../decide.js';

const sendMock = vi.hoisted(() =>
  vi.fn(async (_opts: { html: string; [key: string]: unknown }) => ({ data: { id: 'mock' }, error: null })),
);
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

function cfGroupResponse(include: unknown[] = []) {
  return new Response(
    JSON.stringify({ success: true, errors: [], result: { name: 'task-man-users', include, exclude: [], require: [] } }),
    { status: 200 },
  );
}

describe('landing app', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'landing-app-'));
    sendMock.mockClear();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  function env(overrides: Record<string, string | undefined> = {}): LandingEnv {
    return loadEnv({ LANDING_DATA_DIR: dir, SIGNUP_ALLOW_NO_CAPTCHA: '1', ...overrides });
  }

  function signupsOnDisk(): unknown[] {
    try {
      return JSON.parse(readFileSync(join(dir, 'signups.json'), 'utf-8'));
    } catch {
      return [];
    }
  }

  it('serves healthz', async () => {
    const app = createApp(env());
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('rejects a malformed email with 400', async () => {
    const app = createApp(env());
    const res = await app.request('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(res.status).toBe(400);
    expect(signupsOnDisk()).toHaveLength(0);
  });

  it('rejects an oversized note with 400', async () => {
    const app = createApp(env());
    const res = await app.request('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.com', note: 'x'.repeat(2001) }),
    });
    expect(res.status).toBe(400);
    expect(signupsOnDisk()).toHaveLength(0);
  });

  it('accepts a signup with no Turnstile secret configured (dev mode)', async () => {
    const app = createApp(env());
    const res = await app.request('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dev@example.com' }),
    });
    expect(res.status).toBe(200);
    const onDisk = signupsOnDisk() as Array<{ email: string; status: string }>;
    expect(onDisk).toHaveLength(1);
    expect(onDisk[0]).toMatchObject({ email: 'dev@example.com', status: 'pending' });
  });

  it('rejects a signup that fails Turnstile verification when a secret is configured', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const app = createApp(env({ TURNSTILE_SECRET_KEY: 'secret', TURNSTILE_SITE_KEY: 'pk' }));
    const res = await app.request('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'blocked@example.com', turnstileToken: 'bad-token' }),
    });
    expect(res.status).toBe(403);
    expect(signupsOnDisk()).toHaveLength(0);
  });

  it('accepts a signup that passes Turnstile verification', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const app = createApp(env({ TURNSTILE_SECRET_KEY: 'secret', TURNSTILE_SITE_KEY: 'pk' }));
    const res = await app.request('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ok@example.com', turnstileToken: 'good-token' }),
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(signupsOnDisk()).toHaveLength(1);
  });

  it('returns a byte-identical response for a duplicate signup and does not create a second record or email', async () => {
    const app = createApp(
      env({ RESEND_API_KEY: 'k', SIGNUP_NOTIFY_TO: 'owner@example.com', PRODUCT_URL: 'https://tasks.example.com' }),
    );
    const request = () =>
      app.request('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dupe@example.com' }),
      });

    const first = await request();
    const firstBody = await first.json();
    const second = await request();
    const secondBody = await second.json();

    expect(first.status).toBe(second.status);
    expect(firstBody).toEqual(secondBody);
    expect(signupsOnDisk()).toHaveLength(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('omits approve/deny links from the notification when v2 is not configured', async () => {
    const app = createApp(
      env({ RESEND_API_KEY: 'k', SIGNUP_NOTIFY_TO: 'owner@example.com', PRODUCT_URL: 'https://tasks.example.com' }),
    );
    await app.request('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nolinks@example.com' }),
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).not.toContain('/api/signup/decide');
    expect(html).toContain("manually");
  });

  it('decide returns 404 when v2 env is not configured', async () => {
    const app = createApp(env());
    const res = await app.request('/api/signup/decide?token=whatever');
    expect(res.status).toBe(404);
  });

  it('decide rejects garbage and expired tokens with no side effects', async () => {
    const fetchMock = vi.fn(async () => cfGroupResponse());
    vi.stubGlobal('fetch', fetchMock);
    const fullEnv = env({
      SIGNUP_HMAC_SECRET: 'hmac-secret',
      CF_API_TOKEN: 'cf-token',
      CF_ACCOUNT_ID: 'acct',
      CF_ACCESS_GROUP_ID: 'group',
      LANDING_PUBLIC_URL: 'https://tasks.example.com',
    });
    const app = createApp(fullEnv);

    const garbage = await app.request('/api/signup/decide?token=garbage');
    expect(garbage.status).toBe(400);

    const expiredToken = mintDecideToken(
      { id: 'nope', email: 'x@example.com', decision: 'approve', exp: decideExpiry(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)) },
      'hmac-secret',
    );
    const expired = await app.request(`/api/signup/decide?token=${encodeURIComponent(expiredToken)}`);
    expect(expired.status).toBe(400);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('approves once via decide, updates the Access group, and treats a replay as already-decided with no extra API calls', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || (init.method ?? 'GET') === 'GET') return cfGroupResponse();
      return cfGroupResponse([{ email: { email: 'approve-me@example.com' } }]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const secret = 'hmac-secret';
    const fullEnv = env({
      SIGNUP_HMAC_SECRET: secret,
      CF_API_TOKEN: 'cf-token',
      CF_ACCOUNT_ID: 'acct',
      CF_ACCESS_GROUP_ID: 'group',
      LANDING_PUBLIC_URL: 'https://tasks.example.com',
      RESEND_API_KEY: 'k',
      SIGNUP_NOTIFY_TO: 'owner@example.com',
      PRODUCT_URL: 'https://tasks.example.com',
    });
    const app = createApp(fullEnv);

    // A full attacker-controlled URL stands in for what @hono/node-server
    // would build c.req.url from a spoofed Host header in production.
    const signupRes = await app.request('http://evil.attacker.example/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'approve-me@example.com' }),
    });
    expect(signupRes.status).toBe(200);
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).toContain('/api/signup/decide');
    // Link origin comes from LANDING_PUBLIC_URL, never from the request's own origin.
    expect(html).toContain('https://tasks.example.com/api/signup/decide');
    expect(html).not.toContain('evil.attacker.example');

    const record = (signupsOnDisk() as Array<{ id: string; email: string }>)[0];
    const token = mintDecideToken(
      { id: record.id, email: record.email, decision: 'approve', exp: decideExpiry() },
      secret,
    );

    sendMock.mockClear();
    const first = await app.request(`/api/signup/decide?token=${encodeURIComponent(token)}`);
    expect(first.status).toBe(200);
    expect(await first.text()).toContain('Approved');
    expect(fetchMock).toHaveBeenCalledTimes(2); // GET group, PUT group
    expect(sendMock).toHaveBeenCalledTimes(1); // welcome email

    const onDiskAfterApprove = (signupsOnDisk() as Array<{ status: string }>)[0];
    expect(onDiskAfterApprove.status).toBe('approved');

    fetchMock.mockClear();
    sendMock.mockClear();
    const replay = await app.request(`/api/signup/decide?token=${encodeURIComponent(token)}`);
    expect(replay.status).toBe(200);
    expect(await replay.text()).toContain('already');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('denies via decide without calling the Cloudflare API', async () => {
    const fetchMock = vi.fn(async () => cfGroupResponse());
    vi.stubGlobal('fetch', fetchMock);

    const secret = 'hmac-secret';
    const fullEnv = env({
      SIGNUP_HMAC_SECRET: secret,
      CF_API_TOKEN: 'cf-token',
      CF_ACCOUNT_ID: 'acct',
      CF_ACCESS_GROUP_ID: 'group',
      LANDING_PUBLIC_URL: 'https://tasks.example.com',
    });
    const app = createApp(fullEnv);

    await app.request('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'deny-me@example.com' }),
    });
    const record = (signupsOnDisk() as Array<{ id: string; email: string }>)[0];
    const token = mintDecideToken({ id: record.id, email: record.email, decision: 'deny', exp: decideExpiry() }, secret);

    const res = await app.request(`/api/signup/decide?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Denied');
    expect(fetchMock).not.toHaveBeenCalled();
    expect((signupsOnDisk() as Array<{ status: string }>)[0].status).toBe('denied');
  });
});
