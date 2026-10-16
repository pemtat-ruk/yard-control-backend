import { createHmac, timingSafeEqual } from 'node:crypto';

// session token = "<payload แบบ base64url>.<ลายเซ็น HMAC-SHA256>"
// payload มีแค่ id ผู้ใช้กับเวลาหมดอายุ — สิทธิ์โหลดจากฐานข้อมูลทุก request จึงถอนสิทธิ์แล้วมีผลทันที
const SEPARATOR = '.';
const MS_PER_HOUR = 60 * 60 * 1000;

type Payload = { userId: number; expiresAt: number };

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function createSessionToken(
  userId: number,
  secret: string,
  ttlHours: number,
  now: Date,
): string {
  const payload: Payload = {
    userId,
    expiresAt: now.getTime() + ttlHours * MS_PER_HOUR,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}${SEPARATOR}${sign(body, secret)}`;
}

// คืน id ผู้ใช้ หรือ null เมื่อ token ถูกแก้ หมดอายุ หรือผิดรูปแบบ
export function verifySessionToken(
  token: string | undefined,
  secret: string,
  now: Date,
): number | null {
  if (!token) return null;
  const [body, signature, ...rest] = token.split(SEPARATOR);
  if (!body || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString(),
    ) as Partial<Payload>;
    if (!Number.isInteger(payload.userId)) return null;
    if (typeof payload.expiresAt !== 'number') return null;
    return payload.expiresAt > now.getTime()
      ? (payload.userId as number)
      : null;
  } catch {
    return null;
  }
}
