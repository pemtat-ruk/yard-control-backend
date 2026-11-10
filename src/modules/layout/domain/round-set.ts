import type { RoundSchedule } from '../../booking/domain/rounds.js';
import {
  ROUND_START_MINUTE,
  roundsPerDay,
} from '../../booking/domain/rounds.js';

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;

// คอลัมน์ Time ของ SQL Server รับ-ส่งผ่าน Prisma เป็น Date วันที่ 1970-01-01 (UTC)
export function timeValue(hour: number, minute: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hour % HOURS_PER_DAY, minute));
}

// แถวของ BookingRound หนึ่งชุด: รอบแรกเริ่ม hh:01 จบ hh:00 ของรอบถัดไป ตาม requirement
export function roundRows(schedule: RoundSchedule): {
  roundSequence: number;
  startTime: Date;
  endTime: Date;
  durationHour: number;
}[] {
  return Array.from({ length: roundsPerDay(schedule) }, (_, index) => {
    const startHour = schedule.firstHour + index * schedule.roundHours;
    return {
      roundSequence: index + 1,
      startTime: timeValue(startHour, ROUND_START_MINUTE),
      endTime: timeValue(startHour + schedule.roundHours, 0),
      durationHour: schedule.roundHours,
    };
  });
}

// ชุดรอบจาก BookingRound → ตารางรอบที่ domain ใช้ (รอบเท่ากันทั้งวัน ตามที่หน้าตั้งค่าสร้าง)
export function scheduleOfRows(
  rows: { roundSequence: number; startTime: Date; durationHour: number }[],
): RoundSchedule {
  const first = [...rows].sort((a, b) => a.roundSequence - b.roundSequence)[0];
  if (!first) throw new Error('Round set has no rounds');
  const minutes =
    first.startTime.getUTCHours() * MINUTES_PER_HOUR +
    first.startTime.getUTCMinutes();
  return {
    firstHour: Math.floor(minutes / MINUTES_PER_HOUR),
    roundHours: first.durationHour,
  };
}
