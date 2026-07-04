import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { KeyObject } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { HonoJsonWebKey } from 'hono/utils/jwt/jws';
import { TaskStore } from '../store.js';
import { LocalStore } from '../local-store.js';
import { createApp } from '../server/routes.js';
import { accessAuthFromEnv, createAccessAuth, parseAgents } from '../server/access-auth.js';
import { accessClaims, makeKeyPair, signJwt } from './helpers/access-jwt.js';

const AUD = 'test-aud-tag';

const claims = (overrides: Record<string, unknown> = {}) =>
  accessClaims(AUD, { email: 'mario@example.com', ...overrides });

describe('access-auth middleware', () => {
  let privateKey: KeyObject;
  let jwks: HonoJsonWebKey[];
  let tmpDir: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    ({ privateKey, jwks } = makeKeyPair());
  });

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-access-'));
    const store = new LocalStore(new TaskStore(join(tmpDir, 'tasks.json')));
    app = createApp({
      store,
      accessAuth: createAccessAuth({
        teamDomain: 'testteam',
        aud: AUD,
        keys: jwks,
        agents: { 'mcp-token.example.com': 'mario@example.com' },
      }),
    });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const withJwt = (token: string) => ({ headers: { 'Cf-Access-Jwt-Assertion': token } });

  it('rejects API requests with no JWT', async () => {
    const res = await app.request('/api/tasks');
    expect(res.status).toBe(401);
  });

  it('rejects a garbage token', async () => {
    const res = await app.request('/api/tasks', withJwt('not.a.jwt'));
    expect(res.status).toBe(401);
  });

  it('rejects a valid signature with the wrong audience', async () => {
    const token = signJwt(privateKey, claims({ aud: ['some-other-app'] }));
    const res = await app.request('/api/tasks', withJwt(token));
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt(privateKey, claims({ exp: now - 60 }));
    const res = await app.request('/api/tasks', withJwt(token));
    expect(res.status).toBe(401);
  });

  it('accepts a valid token on both API dialects', async () => {
    const token = signJwt(privateKey, claims());
    const list = await app.request('/api/tasks', withJwt(token));
    expect(list.status).toBe(200);
    const storeList = await app.request('/api/store/tasks', withJwt(token));
    expect(storeList.status).toBe(200);
  });

  it('accepts a mapped service token (common_name → email)', async () => {
    const token = signJwt(
      privateKey,
      claims({ email: undefined, common_name: 'mcp-token.example.com' }),
    );
    const res = await app.request('/api/tasks', withJwt(token));
    expect(res.status).toBe(200);
  });

  it('403s a verified identity that is neither an email nor a mapped agent', async () => {
    const token = signJwt(
      privateKey,
      claims({ email: undefined, common_name: 'unknown-token.example.com' }),
    );
    const res = await app.request('/api/tasks', withJwt(token));
    expect(res.status).toBe(403);
  });

  it('leaves /healthz open for container healthchecks', async () => {
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
  });

  describe('accessAuthFromEnv', () => {
    it('returns null when neither var is set', () => {
      expect(accessAuthFromEnv({})).toBeNull();
    });

    it('throws when only one of the two is set', () => {
      expect(() => accessAuthFromEnv({ CF_ACCESS_TEAM_DOMAIN: 'team' })).toThrow(/together/);
      expect(() => accessAuthFromEnv({ CF_ACCESS_AUD: 'aud' })).toThrow(/together/);
    });

    it('returns middleware when both are set', () => {
      expect(
        accessAuthFromEnv({ CF_ACCESS_TEAM_DOMAIN: 'team', CF_ACCESS_AUD: 'aud' }),
      ).toBeTypeOf('function');
    });
  });

  describe('parseAgents', () => {
    it('parses comma-separated common_name=email pairs', () => {
      expect(parseAgents('a.example.com=x@y.com, b.example.com=z@y.com,')).toEqual({
        'a.example.com': 'x@y.com',
        'b.example.com': 'z@y.com',
      });
    });

    it('returns empty for unset/blank', () => {
      expect(parseAgents(undefined)).toEqual({});
      expect(parseAgents('  ')).toEqual({});
    });

    it('throws on malformed entries', () => {
      expect(() => parseAgents('no-equals-sign')).toThrow(/TASK_MAN_AGENTS/);
      expect(() => parseAgents('name=not-an-email')).toThrow(/TASK_MAN_AGENTS/);
    });
  });
});
