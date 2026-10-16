import { createSessionToken, verifySessionToken } from './session-token.js';

describe('session token', () => {
  const secret = 'a-test-secret-that-is-long-enough-123';
  const now = new Date('2026-10-09T03:00:00Z');
  const token = createSessionToken(42, secret, 8, now);

  it('returns the user id while the token is valid', () => {
    expect(verifySessionToken(token, secret, now)).toBe(42);
  });

  it('rejects a token after it expires', () => {
    const later = new Date('2026-10-09T11:00:01Z');
    expect(verifySessionToken(token, secret, later)).toBeNull();
  });

  it('rejects a token signed with another secret or edited by the client', () => {
    expect(verifySessionToken(token, `${secret}x`, now)).toBeNull();
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ userId: 1, expiresAt: now.getTime() + 1000 }),
    ).toString('base64url');
    expect(
      verifySessionToken(`${forged}.${signature}`, secret, now),
    ).toBeNull();
  });

  it('rejects missing or malformed tokens', () => {
    expect(verifySessionToken(undefined, secret, now)).toBeNull();
    expect(verifySessionToken('not-a-token', secret, now)).toBeNull();
  });
});
