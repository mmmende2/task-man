import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { verifyWithJwks } from 'hono/jwt';
import type { HonoJsonWebKey } from 'hono/utils/jwt/jws';

// Cloudflare Access forwards a signed JWT on every request it lets through.
// Verifying it at the origin means the tunnel is no longer the only
// perimeter: a request that reaches :3030 without having passed Access
// (misconfigured ports, another container, a compromised connector) is
// rejected here. Verification also yields the caller's identity (email
// claim for users, common-name for service tokens) — the seed for any
// future authorization layer.
//
// Hand-rolled rather than hono's `jwk` middleware because that middleware
// insists on a `Bearer ` prefix even in custom headers, and Cloudflare
// sends the bare JWT.
const CF_JWT_HEADER = 'Cf-Access-Jwt-Assertion';

// Access signing keys rotate on the order of weeks; an hour of caching
// removes a per-request round trip to Cloudflare without meaningfully
// delaying rotation pickup.
const JWKS_TTL_MS = 60 * 60 * 1000;

export interface AccessAuthOptions {
  /** Zero Trust team domain — "myteam" or "myteam.cloudflareaccess.com". */
  teamDomain: string;
  /** The Access application's Audience (AUD) tag. */
  aud: string;
  /**
   * Service-token mapping: common_name → the email whose tasks the token
   * acts on (e.g. the MCP server's token → Mario). A verified identity that
   * is neither an email nor a mapped common name gets 403 — Access let it
   * in the door, the app still refuses.
   */
  agents?: Record<string, string>;
  /** Test seam: static keys instead of fetching the team's JWKS. */
  keys?: HonoJsonWebKey[];
}

/**
 * Parses TASK_MAN_AGENTS: comma-separated `common_name=email` pairs, e.g.
 * "mcp-home.example.com=mario@example.com". Throws on malformed entries —
 * a typo here should kill the deploy, not silently 403 the MCP server.
 */
export function parseAgents(raw: string | undefined): Record<string, string> {
  const agents: Record<string, string> = {};
  if (!raw?.trim()) return agents;
  for (const entry of raw.split(',')) {
    if (!entry.trim()) continue;
    const eq = entry.indexOf('=');
    const name = entry.slice(0, eq).trim();
    const email = entry.slice(eq + 1).trim();
    if (eq === -1 || !name || !email.includes('@')) {
      throw new Error(`TASK_MAN_AGENTS entry "${entry.trim()}" is not <common_name>=<email>.`);
    }
    agents[name] = email;
  }
  return agents;
}

function certsUrl(teamDomain: string): string {
  const host = teamDomain.includes('.') ? teamDomain : `${teamDomain}.cloudflareaccess.com`;
  return `https://${host}/cdn-cgi/access/certs`;
}

function cachedJwksFetcher(url: string): () => Promise<HonoJsonWebKey[]> {
  let cache: { keys: HonoJsonWebKey[]; fetchedAt: number } | null = null;
  return async () => {
    if (cache && Date.now() - cache.fetchedAt < JWKS_TTL_MS) return cache.keys;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch Access signing keys from ${url} (${res.status})`);
    const body = (await res.json()) as { keys?: HonoJsonWebKey[] };
    if (!Array.isArray(body.keys)) throw new Error(`Unexpected JWKS response from ${url}`);
    cache = { keys: body.keys, fetchedAt: Date.now() };
    return cache.keys;
  };
}

export function createAccessAuth(opts: AccessAuthOptions): MiddlewareHandler {
  const getKeys = opts.keys ? async () => opts.keys! : cachedJwksFetcher(certsUrl(opts.teamDomain));

  return async (c, next) => {
    const token = c.req.raw.headers.get(CF_JWT_HEADER);
    if (!token) {
      throw new HTTPException(401, { message: 'Missing Cloudflare Access token.' });
    }
    let payload;
    try {
      payload = await verifyWithJwks(token, {
        keys: await getKeys(),
        allowedAlgorithms: ['RS256'],
        verification: { aud: opts.aud },
      });
    } catch {
      throw new HTTPException(401, { message: 'Invalid Cloudflare Access token.' });
    }
    // Interactive logins carry `email`; service tokens carry `common_name`
    // and must be mapped to the person they act for. authentication passed,
    // but an identity we can't resolve to a person owns no tasks → 403.
    const email = typeof payload.email === 'string' ? payload.email : null;
    const commonName = typeof payload.common_name === 'string' ? payload.common_name : null;
    const identity = email ?? (commonName ? (opts.agents?.[commonName] ?? null) : null);
    if (!identity) {
      throw new HTTPException(403, { message: 'Identity is not authorized for this application.' });
    }
    c.set('accessIdentity', identity);
    await next();
  };
}

/**
 * Builds the middleware from CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD, or null
 * when unset (local dev — loopback bind is the gate there). Setting exactly
 * one of the two is almost certainly a broken deploy, so it throws rather
 * than silently running unprotected.
 */
export function accessAuthFromEnv(env: NodeJS.ProcessEnv = process.env): MiddlewareHandler | null {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;
  if (!teamDomain && !aud) return null;
  if (!teamDomain || !aud) {
    throw new Error('CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must be set together.');
  }
  return createAccessAuth({ teamDomain, aud, agents: parseAgents(env.TASK_MAN_AGENTS) });
}
