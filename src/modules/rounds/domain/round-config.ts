import { addDays } from '../../../common/service-date.js';
import {
  ALLOWED_ROUND_HOURS,
  MAX_ADVANCE_DAYS,
} from '../../booking/domain/rounds.js';

const LAST_HOUR = 23;

export type RoundConfigError =
  | 'ROUND_HOURS_INVALID'
  | 'ROUND_FIRST_HOUR_INVALID'
  | 'ROUND_EFFECTIVE_TOO_SOON';

// วันแรกที่ตั้งตารางรอบใหม่ได้: พ้นช่วงที่เปิดให้จองล่วงหน้าแล้ว จึงยังไม่มีใครจองวันนั้น
export function earliestEffectiveDate(today: string): string {
  return addDays(today, MAX_ADVANCE_DAYS + 1);
}

// ตรวจตารางรอบใหม่: ชั่วโมงต่อรอบหาร 24 ลงตัว, ชั่วโมงเริ่ม 0–23, มีผลหลังช่วงจองล่วงหน้า
export function checkRoundConfig(
  input: { effectiveFrom: string; firstHour: number; roundHours: number },
  today: string,
): RoundConfigError | null {
  if (!ALLOWED_ROUND_HOURS.includes(input.roundHours)) {
    return 'ROUND_HOURS_INVALID';
  }
  if (
    !Number.isInteger(input.firstHour) ||
    input.firstHour < 0 ||
    input.firstHour > LAST_HOUR
  ) {
    return 'ROUND_FIRST_HOUR_INVALID';
  }
  if (input.effectiveFrom < earliestEffectiveDate(today)) {
    return 'ROUND_EFFECTIVE_TOO_SOON';
  }
  return null;
}
