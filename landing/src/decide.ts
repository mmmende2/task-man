import { createHmac, timingSafeEqual } from 'node:crypto';

export interface DecideTokenPayload {
  id: string;
  email: string;
  decision: 'approve' | 'deny';
  /** Epoch seconds. */
  exp: number;
}

export const DECIDE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function decideExpiry(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000) + DECIDE_TOKEN_TTL_SECONDS;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function mintDecideToken(payload: DecideTokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

// Verifies signature + shape + expiry. Returns null on anything wrong
// (malformed, forged, or expired) — callers don't need to distinguish why.
export function verifyDecideToken(token: string, secret: string): DecideTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expected = sign(body, secret);
  const sigBuf = Buffer.from(sig, 'base64url');
  const expectedBuf = Buffer.from(expected, 'base64url');
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Partial<DecideTokenPayload>;
  if (typeof p.id !== 'string' || typeof p.email !== 'string') return null;
  if (p.decision !== 'approve' && p.decision !== 'deny') return null;
  if (typeof p.exp !== 'number' || p.exp < Date.now() / 1000) return null;

  return { id: p.id, email: p.email, decision: p.decision, exp: p.exp };
}

export interface CloudflareAccessGroupConfig {
  apiToken: string;
  accountId: string;
  groupId: string;
}

interface AccessGroupApiResponse {
  success: boolean;
  errors: unknown[];
  result: {
    name: string;
    include: unknown[];
    exclude: unknown[];
    require: unknown[];
  };
}

function includesEmail(include: unknown[], email: string): boolean {
  return include.some(
    (rule) =>
      typeof rule === 'object' &&
      rule !== null &&
      'email' in rule &&
      typeof (rule as { email?: { email?: string } }).email?.email === 'string' &&
      (rule as { email: { email: string } }).email.email === email,
  );
}

// The Cloudflare Access Groups API is full-replace: there is no "append"
// endpoint, so this reads the group, adds the email if it isn't already
// there, and PUTs the whole thing back. Idempotent: re-running with an email
// already in the group is a no-op (no PUT call at all).
export async function addEmailToAccessGroup(config: CloudflareAccessGroupConfig, email: string): Promise<void> {
  const base = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/access/groups/${config.groupId}`;
  const headers = {
    Authorization: `Bearer ${config.apiToken}`,
    'Content-Type': 'application/json',
  };

  const getRes = await fetch(base, { headers });
  if (!getRes.ok) {
    throw new Error(`Failed to read Access group: ${getRes.status} ${await getRes.text()}`);
  }
  const current = (await getRes.json()) as AccessGroupApiResponse;
  if (!current.success) {
    throw new Error(`Cloudflare API error reading Access group: ${JSON.stringify(current.errors)}`);
  }

  if (includesEmail(current.result.include, email)) return;

  const putRes = await fetch(base, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      name: current.result.name,
      include: [...current.result.include, { email: { email } }],
      exclude: current.result.exclude,
      require: current.result.require,
    }),
  });
  if (!putRes.ok) {
    throw new Error(`Failed to update Access group: ${putRes.status} ${await putRes.text()}`);
  }
  const updated = (await putRes.json()) as AccessGroupApiResponse;
  if (!updated.success) {
    throw new Error(`Cloudflare API error updating Access group: ${JSON.stringify(updated.errors)}`);
  }
}
