import { timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { getConnInfo } from '@hono/node-server/conninfo';

export const SESSION_COOKIE = 'task-man-session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// ── Constant-time PIN comparison ────────────────────────────
// The PIN is a short string; compare in constant time so a LAN
// attacker can't time their way to it. Length mismatch still runs
// a comparison to avoid an early-return timing signal.
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

// ── Login rate limiting (per IP) ────────────────────────────
// 5 failed attempts per 5-minute window, then exponential backoff.
// The real control against a 10k-keyspace PIN brute force.
// Instantiate one per createApp() so each app — including each test —
// starts with a clean slate; no module-global state to reset.

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

interface RateState {
  failures: number;
  windowStart: number;
  blockedUntil: number;
}

export interface RateLimiter {
  status(ip: string): { blocked: boolean; retryAfter: number };
  recordFailure(ip: string): void;
  clear(ip: string): void;
}

export function createRateLimiter(): RateLimiter {
  const byIp = new Map<string, RateState>();
  return {
    status(ip) {
      const now = Date.now();
      const s = byIp.get(ip);
      if (!s) return { blocked: false, retryAfter: 0 };
      if (now < s.blockedUntil) {
        return { blocked: true, retryAfter: Math.ceil((s.blockedUntil - now) / 1000) };
      }
      return { blocked: false, retryAfter: 0 };
    },
    recordFailure(ip) {
      const now = Date.now();
      let s = byIp.get(ip);
      if (!s || now - s.windowStart > WINDOW_MS) {
        s = { failures: 0, windowStart: now, blockedUntil: 0 };
      }
      s.failures += 1;
      if (s.failures >= MAX_ATTEMPTS) {
        // Exponential backoff once the window's allowance is spent.
        s.blockedUntil = now + WINDOW_MS * Math.pow(2, s.failures - MAX_ATTEMPTS);
      }
      byIp.set(ip, s);
    },
    clear(ip) {
      byIp.delete(ip);
    },
  };
}

export function clientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── Session cookie ──────────────────────────────────────────
export async function issueSession(c: Context, secret: string): Promise<void> {
  await setSignedCookie(c, SESSION_COOKIE, 'authenticated', secret, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

export function clearSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export async function hasValidSession(c: Context, secret: string): Promise<boolean> {
  // getSignedCookie returns the value, or false if the signature is
  // bad, or undefined if absent — anything falsy means "not authed".
  const value = await getSignedCookie(c, secret, SESSION_COOKIE);
  return Boolean(value);
}
