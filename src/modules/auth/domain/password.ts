import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// เก็บรหัสผ่านเป็น "scrypt$<salt>$<hash>" — ไม่เก็บและไม่ log รหัสผ่านจริง
const SCHEME = 'scrypt';
const SALT_BYTES = 16;
const KEY_BYTES = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const hash = scryptSync(password, salt, KEY_BYTES).toString('hex');
  return [SCHEME, salt, hash].join('$');
}

export function verifyPassword(
  password: string,
  stored: string | null,
): boolean {
  const [scheme, salt, hash] = (stored ?? '').split('$');
  if (scheme !== SCHEME || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const given = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, given);
}
