import { describe, it, expect } from 'vitest';
import { loadEnv } from '../env.js';

const NO_CAPTCHA = { SIGNUP_ALLOW_NO_CAPTCHA: '1' };
const TURNSTILE = { TURNSTILE_SECRET_KEY: 'sk', TURNSTILE_SITE_KEY: 'pk' };
const V2 = {
  SIGNUP_HMAC_SECRET: 's',
  CF_API_TOKEN: 't',
  CF_ACCOUNT_ID: 'a',
  CF_ACCESS_GROUP_ID: 'g',
  LANDING_PUBLIC_URL: 'https://tasks.example.com',
};

describe('loadEnv', () => {
  it('runs in full dev mode with no env but the CAPTCHA opt-out flag', () => {
    const env = loadEnv({ ...NO_CAPTCHA });
    expect(env.port).toBe(3040);
    expect(env.emailEnabled).toBe(false);
    expect(env.v2Enabled).toBe(false);
    expect(env.turnstileEnabled).toBe(false);
    expect(env.turnstileSecretKey).toBeNull();
    expect(env.landingPublicUrl).toBeNull();
  });

  it('enables email only when all three v1 vars are set', () => {
    const env = loadEnv({
      ...NO_CAPTCHA,
      RESEND_API_KEY: 'k',
      SIGNUP_NOTIFY_TO: 'owner@example.com',
      PRODUCT_URL: 'https://tasks.example.com',
    });
    expect(env.emailEnabled).toBe(true);
    expect(env.v2Enabled).toBe(false);
  });

  it('throws on a partial v1 group', () => {
    expect(() => loadEnv({ ...NO_CAPTCHA, RESEND_API_KEY: 'k' })).toThrow(/partial email config/i);
  });

  it('enables v2 only when all five vars are set', () => {
    const env = loadEnv({ ...NO_CAPTCHA, ...V2 });
    expect(env.v2Enabled).toBe(true);
    expect(env.landingPublicUrl).toBe('https://tasks.example.com');
  });

  it('throws on a partial v2 group', () => {
    expect(() =>
      loadEnv({ ...NO_CAPTCHA, SIGNUP_HMAC_SECRET: 's', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a' }),
    ).toThrow(/partial one-click-approval config/i);
  });

  it('throws when v2 is fully set but LANDING_PUBLIC_URL is missing', () => {
    const { LANDING_PUBLIC_URL, ...v2WithoutUrl } = V2;
    expect(() => loadEnv({ ...NO_CAPTCHA, ...v2WithoutUrl })).toThrow(/partial one-click-approval config/i);
  });

  it('throws when LANDING_PUBLIC_URL is not a valid URL', () => {
    expect(() => loadEnv({ ...NO_CAPTCHA, ...V2, LANDING_PUBLIC_URL: 'not-a-url' })).toThrow(
      /LANDING_PUBLIC_URL is not a valid URL/i,
    );
  });

  it('normalizes LANDING_PUBLIC_URL to its origin, dropping any path', () => {
    const env = loadEnv({ ...NO_CAPTCHA, ...V2, LANDING_PUBLIC_URL: 'https://tasks.example.com/foo?x=1' });
    expect(env.landingPublicUrl).toBe('https://tasks.example.com');
  });

  it('throws when Turnstile vars are unset and the CAPTCHA opt-out flag is absent', () => {
    expect(() => loadEnv({})).toThrow(/TURNSTILE_SECRET_KEY\/TURNSTILE_SITE_KEY not set/i);
  });

  it('throws on a partial Turnstile group', () => {
    expect(() => loadEnv({ TURNSTILE_SECRET_KEY: 'sk' })).toThrow(/partial Turnstile config/i);
  });

  it('enables Turnstile when both vars are set', () => {
    const env = loadEnv({ ...TURNSTILE });
    expect(env.turnstileEnabled).toBe(true);
  });

  it('respects PORT and LANDING_DATA_DIR overrides', () => {
    const env = loadEnv({ ...NO_CAPTCHA, PORT: '4100', LANDING_DATA_DIR: '/tmp/foo' });
    expect(env.port).toBe(4100);
    expect(env.dataDir).toBe('/tmp/foo');
  });
});
