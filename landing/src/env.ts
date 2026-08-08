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
  /** True only when every v2 (one-click approval) var is set. */
  v2Enabled: boolean;
  /** True only when every v1 (email notification) var is set. */
  emailEnabled: boolean;
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
  });
  if (v2.anySet && !v2.allSet) {
    throw new Error(
      `landing: partial one-click-approval config — missing ${v2.missing.join(', ')}. Set SIGNUP_HMAC_SECRET, CF_API_TOKEN, CF_ACCOUNT_ID and CF_ACCESS_GROUP_ID together, or leave all four unset to run notify-only (v1).`,
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
    v2Enabled: v2.allSet,
    emailEnabled: v1.allSet,
  };
}
