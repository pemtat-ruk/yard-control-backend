import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// rate limit ต่อ "ใคร": endpoint ที่มีบัญชีในคำขอ (เข้าสู่ระบบ ลงทะเบียน ตรวจลูกค้า) นับแยกตามบัญชีด้วย
// เหตุ: บน Render คำขอผ่าน frontend (rewrite) ก่อนถึง backend — ถ้าตั้ง TRUST_PROXY_HOPS ไม่ตรง ip ของทุกคน
// เป็น ip ของ frontend เครื่องเดียว คนหนึ่งกดผิดหลายครั้งจะทำให้ทุกคนเข้าสู่ระบบไม่ได้ (429)
// การเดารหัสของบัญชีหนึ่งยังถูกจำกัดเท่าเดิม (10 ครั้งต่อนาทีต่อบัญชีต่อ ip)
@Injectable()
export class AccountAwareThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const account = [body.employeeCode, body.phone, body.laborCardNo]
      .find((value): value is string => typeof value === 'string' && value.trim() !== '')
      ?.trim()
      .toLowerCase();
    const ip = typeof req.ip === 'string' ? req.ip : '';
    return Promise.resolve(account ? `${ip}|${account}` : ip);
  }
}
