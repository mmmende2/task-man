import { describe, it, expect } from 'vitest';
import { decideExpiry, mintDecideToken, verifyDecideToken } from '../decide.js';

describe('decide tokens', () => {
  const secret = 'test-secret';

  it('mints a token that verifies back to the same payload', () => {
    const payload = { id: 'abc', email: 'a@example.com', decision: 'approve' as const, exp: decideExpiry() };
    const token = mintDecideToken(payload, secret);
    expect(verifyDecideToken(token, secret)).toEqual(payload);
  });

  it('rejects a token signed with a different secret', () => {
    const token = mintDecideToken({ id: 'abc', email: 'a@example.com', decision: 'approve', exp: decideExpiry() }, secret);
    expect(verifyDecideToken(token, 'wrong-secret')).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = mintDecideToken({ id: 'abc', email: 'a@example.com', decision: 'deny', exp: decideExpiry() }, secret);
    const [body, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    decoded.decision = 'approve';
    const tamperedBody = Buffer.from(JSON.stringify(decoded), 'utf-8').toString('base64url');
    expect(verifyDecideToken(`${tamperedBody}.${sig}`, secret)).toBeNull();
  });

  it('rejects an expired token', () => {
    const expired = decideExpiry(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));
    const token = mintDecideToken({ id: 'abc', email: 'a@example.com', decision: 'approve', exp: expired }, secret);
    expect(verifyDecideToken(token, secret)).toBeNull();
  });

  it('rejects garbage tokens', () => {
    expect(verifyDecideToken('not-a-token', secret)).toBeNull();
    expect(verifyDecideToken('', secret)).toBeNull();
    expect(verifyDecideToken('a.b.c', secret)).toBeNull();
  });
});
