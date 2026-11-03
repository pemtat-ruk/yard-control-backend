// กันการเดารหัสผ่านพนักงาน: ผิดติดกันครบ MAX_FAILED_LOGINS ครั้ง ล็อกบัญชีชั่วคราว LOCK_MINUTES นาที
// นับแยกจาก rate limit ต่อ ip (ผู้เดาเปลี่ยน ip ได้ แต่เปลี่ยนบัญชีที่เดาไม่ได้) — เข้าสำเร็จแล้วนับใหม่
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
const MS_PER_MINUTE = 60 * 1000;

export type LockState = { failedLogins: number; lockedUntil: Date | null };

export function isLocked(state: LockState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil > now;
}

// สถานะหลังใส่รหัสผิดหนึ่งครั้ง: ครบจำนวนแล้วล็อก และเริ่มนับใหม่สำหรับรอบหลังปลดล็อก
export function afterFailedLogin(state: LockState, now: Date): LockState {
  // ล็อกเก่าหมดอายุแล้ว: เริ่มนับจากศูนย์
  const failed =
    (state.lockedUntil && state.lockedUntil <= now ? 0 : state.failedLogins) +
    1;
  if (failed >= MAX_FAILED_LOGINS) {
    return {
      failedLogins: 0,
      lockedUntil: new Date(now.getTime() + LOCK_MINUTES * MS_PER_MINUTE),
    };
  }
  return { failedLogins: failed, lockedUntil: null };
}
