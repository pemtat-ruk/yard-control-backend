import type { RoundSchedule } from '../booking/domain/rounds.js';

const MS_PER_HOUR = 60 * 60 * 1000;
// เวลาไทย UTC+7 ไม่มีเวลาออมแสง
const BANGKOK_OFFSET_MS = 7 * MS_PER_HOUR;

// ลำดับที่ของรอบที่เวลานี้อยู่ (นับต่อเนื่องข้ามวัน) — รอบเริ่มที่ firstHour และทุก ๆ roundHours ตามเวลาไทย
function roundIndexAt(at: Date, schedule: RoundSchedule): number {
  const local = at.getTime() + BANGKOK_OFFSET_MS;
  return Math.floor(
    (local - schedule.firstHour * MS_PER_HOUR) /
      (schedule.roundHours * MS_PER_HOUR),
  );
}

// ระหว่างสองครั้งที่งานตามเวลาทำงาน มีการขึ้นรอบใหม่หรือไม่ — สถานะช่องเปลี่ยนตามเวลา (เริ่มใช้, หมดเวลา)
export function crossedRoundBoundary(
  previous: Date,
  now: Date,
  schedule: RoundSchedule,
): boolean {
  return roundIndexAt(previous, schedule) !== roundIndexAt(now, schedule);
}
