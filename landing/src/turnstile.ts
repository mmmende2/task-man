const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  ok: boolean;
  /** True when no secret key is configured — verification was skipped (dev mode). */
  skipped: boolean;
}

// No secret key configured => dev mode, always passes (a startup warning is
// logged once by the caller, not per-request here).
export async function verifyTurnstile(
  token: string | undefined,
  secretKey: string | null,
  remoteIp?: string,
): Promise<TurnstileResult> {
  if (!secretKey) {
    return { ok: true, skipped: true };
  }
  if (!token) {
    return { ok: false, skipped: false };
  }

  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  const res = await fetch(VERIFY_URL, { method: 'POST', body });
  if (!res.ok) return { ok: false, skipped: false };
  const data = (await res.json()) as { success: boolean };
  return { ok: data.success === true, skipped: false };
}
