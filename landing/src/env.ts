import { homedir } from 'node:os';
import { join } from 'node:path';

export interface LandingEnv {
  port: number;
  dataDir: string;
  resendApiKey: string | null;
  signupNotifyTo: string | null;
  productUrl: string | null;
  turnstileSecretKey: string | null;
  turnstileSiteKey: string | null;
  signupHmacSecret: string | null;
  cfApiToken: string | null;
  cfAccountId: string | null;
  cfAccessGroupId: string | null;
  /** Normalized origin of LANDING_PUBLIC_URL, e.g. "https://tasks.example.com". */
  landingPublicUrl: string | null;
  /** True only when every v2 (one-click approval) var is set. */
  v2Enabled: boolean;
  /** True only when every v1 (email notification) var is set. */
  emailEnabled: boolean;
  /** True only when both Turnstile vars are set. */
  turnstileEnabled: boolean;
}

// Each of these is a group of vars that only makes sense set together — a
// partial group is a misconfiguration, not a smaller feature. Fail loudly at
// startup rather than silently running with (e.g.) a Resend key but nowhere
// to send to.
function groupStatus(vars: Record<string, string | undefined>): { allSet: boolean; anySet: boolean; missing: string[] } {
  const entries = Object.entries(vars);
  const missing = entries.filter(([, v]) => !v).map(([k]) => k);
  return { allSet: missing.length === 0, anySet: missing.length < entries.length, missing };
}

export function loadEnv(env: NodeJS.ProcessEnv = process.env): LandingEnv {
  const port = env.PORT ? Number(env.PORT) : 3040;
  const dataDir = env.LANDING_DATA_DIR || join(homedir(), '.task-man-landing');

  const v1 = groupStatus({
    RESEND_API_KEY: env.RESEND_API_KEY,
    SIGNUP_NOTIFY_TO: env.SIGNUP_NOTIFY_TO,
    PRODUCT_URL: env.PRODUCT_URL,
  });
  if (v1.anySet && !v1.allSet) {
    throw new Error(
      `landing: partial email config — missing ${v1.missing.join(', ')}. Set RESEND_API_KEY, SIGNUP_NOTIFY_TO and PRODUCT_URL together, or leave all three unset for dev mode (no emails sent).`,
    );
  }

  const v2 = groupStatus({
    SIGNUP_HMAC_SECRET: env.SIGNUP_HMAC_SECRET,
    CF_API_TOKEN: env.CF_API_TOKEN,
    CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
    CF_ACCESS_GROUP_ID: env.CF_ACCESS_GROUP_ID,
    LANDING_PUBLIC_URL: env.LANDING_PUBLIC_URL,
  });
  if (v2.anySet && !v2.allSet) {
    throw new Error(
      `landing: partial one-click-approval config — missing ${v2.missing.join(', ')}. Set SIGNUP_HMAC_SECRET, CF_API_TOKEN, CF_ACCOUNT_ID, CF_ACCESS_GROUP_ID and LANDING_PUBLIC_URL together, or leave all five unset to run notify-only (v1).`,
    );
  }

  let landingPublicUrl: string | null = null;
  if (v2.allSet) {
    try {
      landingPublicUrl = new URL(env.LANDING_PUBLIC_URL!).origin;
    } catch {
      throw new Error(`landing: LANDING_PUBLIC_URL is not a valid URL: ${env.LANDING_PUBLIC_URL}`);
    }
  }

  // CAPTCHA is required on a public deployment. A missing/partial Turnstile
  // config fails startup unless the operator explicitly opts out (dev only).
  const turnstile = groupStatus({
    TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY,
    TURNSTILE_SITE_KEY: env.TURNSTILE_SITE_KEY,
  });
  if (turnstile.anySet && !turnstile.allSet) {
    throw new Error(
      `landing: partial Turnstile config — missing ${turnstile.missing.join(', ')}. Set TURNSTILE_SECRET_KEY and TURNSTILE_SITE_KEY together, or leave both unset (with SIGNUP_ALLOW_NO_CAPTCHA=1) to run without CAPTCHA.`,
    );
  }
  if (!turnstile.allSet && env.SIGNUP_ALLOW_NO_CAPTCHA !== '1') {
    throw new Error(
      'landing: TURNSTILE_SECRET_KEY/TURNSTILE_SITE_KEY not set. Set both, or set SIGNUP_ALLOW_NO_CAPTCHA=1 to explicitly run without CAPTCHA (dev only — never on a public deployment).',
    );
  }

  return {
    port,
    dataDir,
    resendApiKey: env.RESEND_API_KEY || null,
    signupNotifyTo: env.SIGNUP_NOTIFY_TO || null,
    productUrl: env.PRODUCT_URL || null,
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY || null,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
    signupHmacSecret: env.SIGNUP_HMAC_SECRET || null,
    cfApiToken: env.CF_API_TOKEN || null,
    cfAccountId: env.CF_ACCOUNT_ID || null,
    cfAccessGroupId: env.CF_ACCESS_GROUP_ID || null,
    landingPublicUrl,
    v2Enabled: v2.allSet,
    emailEnabled: v1.allSet,
    turnstileEnabled: turnstile.allSet,
  };
}
