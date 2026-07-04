import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import type { HonoJsonWebKey } from 'hono/utils/jwt/jws';

// Shared RS256 test-signing kit for Access-JWT tests. Hand-rolled because
// hono's sign() doesn't emit a `kid` header, and verifyWithJwks rejects
// kid-less tokens outright.

export const KID = 'test-key-1';

const b64url = (data: string | Buffer): string =>
  Buffer.from(data).toString('base64url');

export function makeKeyPair(): { privateKey: KeyObject; jwks: HonoJsonWebKey[] } {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = pair.publicKey.export({ format: 'jwk' }) as HonoJsonWebKey;
  return { privateKey: pair.privateKey, jwks: [{ ...jwk, kid: KID, alg: 'RS256' }] };
}

export function signJwt(privateKey: KeyObject, payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }));
  const body = b64url(JSON.stringify(payload));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(privateKey).toString('base64url')}`;
}

/** Standard Access claims for audience `aud`, overridable per test. */
export function accessClaims(
  aud: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return { aud: [aud], iat: now - 10, exp: now + 300, ...overrides };
}
