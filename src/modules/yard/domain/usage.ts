// ข้อ 4, 5: ช่องจอดหนึ่งช่องอยู่ในช่วงไหนของการใช้งาน เทียบกับเวลาปัจจุบัน
export type UsagePhase = 'UPCOMING' | 'ACTIVE' | 'OVERTIME' | 'PAST';

export type UsageWindow = { startsAt: Date; endsAt: Date };

// ช่องที่หมดเวลาแล้วแต่ไม่มีใครบันทึกว่ารถออก จะค้างสถานะหมดเวลาไม่เกินเท่านี้
// กันผังค้างสีเหลืองถาวรเมื่อผู้ตรวจสอบไม่ได้บันทึกผล
export const OVERTIME_LOOKBACK_HOURS = 24;

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

// vacated = ผู้ตรวจสอบบันทึกแล้วว่ารถออกจากช่อง
export function usagePhase(
  window: UsageWindow,
  now: Date,
  vacated: boolean,
): UsagePhase {
  const time = now.getTime();
  if (time < window.startsAt.getTime()) return 'UPCOMING';
  if (time < window.endsAt.getTime()) return vacated ? 'PAST' : 'ACTIVE';
  const lookbackEnd =
    window.endsAt.getTime() + OVERTIME_LOOKBACK_HOURS * MS_PER_HOUR;
  return !vacated && time < lookbackEnd ? 'OVERTIME' : 'PAST';
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.max(
    0,
    Math.floor((to.getTime() - from.getTime()) / MS_PER_MINUTE),
  );
}
