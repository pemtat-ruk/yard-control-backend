import { createHmac, timingSafeEqual } from 'node:crypto';

// session token = "<payload แบบ base64url>.<ลายเซ็น HMAC-SHA256>"
// payload มีแค่ผู้ใช้ (E:<EmpCode> หรือ C:<CusId>) กับเวลาหมดอายุ — สิทธิ์โหลดจากฐานข้อมูลทุก request จึงถอนสิทธิ์แล้วมีผลทันที
const SEPARATOR = '.';
const MS_PER_HOUR = 60 * 60 * 1000;

type Payload = { subject: string; expiresAt: number };

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function createSessionToken(
  subject: string,
  secret: string,
  ttlHours: number,
  now: Date,
): string {
  const payload: Payload = {
    subject,
    expiresAt: now.getTime() + ttlHours * MS_PER_HOUR,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}${SEPARATOR}${sign(body, secret)}`;
}

// คืนผู้ใช้ (subject) หรือ null เมื่อ token ถูกแก้ หมดอายุ หรือผิดรูปแบบ
export function verifySessionToken(
  token: string | undefined,
  secret: string,
  now: Date,
): string | null {
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
    if (typeof payload.subject !== 'string' || !payload.subject) return null;
    if (typeof payload.expiresAt !== 'number') return null;
    return payload.expiresAt > now.getTime() ? payload.subject : null;
  } catch {
    return null;
  }
}
