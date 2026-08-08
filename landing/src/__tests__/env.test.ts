import { describe, it, expect } from 'vitest';
import { loadEnv } from '../env.js';

describe('loadEnv', () => {
  it('runs in full dev mode with no env at all', () => {
    const env = loadEnv({});
    expect(env.port).toBe(3040);
    expect(env.emailEnabled).toBe(false);
    expect(env.v2Enabled).toBe(false);
    expect(env.turnstileSecretKey).toBeNull();
  });

  it('enables email only when all three v1 vars are set', () => {
    const env = loadEnv({
      RESEND_API_KEY: 'k',
      SIGNUP_NOTIFY_TO: 'owner@example.com',
      PRODUCT_URL: 'https://tasks.example.com',
    });
    expect(env.emailEnabled).toBe(true);
    expect(env.v2Enabled).toBe(false);
  });

  it('throws on a partial v1 group', () => {
    expect(() => loadEnv({ RESEND_API_KEY: 'k' })).toThrow(/partial email config/i);
  });

  it('enables v2 only when all four vars are set', () => {
    const env = loadEnv({
      SIGNUP_HMAC_SECRET: 's',
      CF_API_TOKEN: 't',
      CF_ACCOUNT_ID: 'a',
      CF_ACCESS_GROUP_ID: 'g',
    });
    expect(env.v2Enabled).toBe(true);
  });

  it('throws on a partial v2 group', () => {
    expect(() =>
      loadEnv({ SIGNUP_HMAC_SECRET: 's', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a' }),
    ).toThrow(/partial one-click-approval config/i);
  });

  it('respects PORT and LANDING_DATA_DIR overrides', () => {
    const env = loadEnv({ PORT: '4100', LANDING_DATA_DIR: '/tmp/foo' });
    expect(env.port).toBe(4100);
    expect(env.dataDir).toBe('/tmp/foo');
  });
});
