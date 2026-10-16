import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('accepts the right password and rejects a wrong one', () => {
    const stored = hashPassword('correct horse');
    expect(verifyPassword('correct horse', stored)).toBe(true);
    expect(verifyPassword('wrong', stored)).toBe(false);
  });

  it('never stores the password itself and salts every hash', () => {
    const first = hashPassword('secret');
    expect(first).not.toContain('secret');
    expect(hashPassword('secret')).not.toBe(first);
  });

  it('rejects accounts that have no password', () => {
    expect(verifyPassword('anything', null)).toBe(false);
  });
});
