// วันที่ในระบบใช้รูปแบบ "YYYY-MM-DD" ตามเวลาไทย (UTC+7, ไม่มี DST)
export const BANGKOK_OFFSET = '+07:00';
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BANGKOK_OFFSET_MS = 7 * HOUR_MS;

function toUtcMs(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!DATE_PATTERN.test(date) || Number.isNaN(ms)) {
    throw new Error(`Invalid date: ${date}`);
  }
  return ms;
}

export function todayInBangkok(now: Date = new Date()): string {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function dateRange(start: string, end: string): string[] {
  const count = diffDays(start, end) + 1;
  return Array.from({ length: Math.max(count, 0) }, (_, i) =>
    addDays(start, i),
  );
}

// เวลา ณ ชั่วโมงที่กำหนดของวันนั้นตามเวลาไทย; hour เกิน 24 ได้ (ข้ามไปวันถัดไป)
export function bangkokInstant(date: string, hour = 0): Date {
  const day = addDays(date, Math.floor(hour / 24));
  const hh = String(hour % 24).padStart(2, '0');
  return new Date(`${day}T${hh}:00:00${BANGKOK_OFFSET}`);
}

// คอลัมน์ชนิด DATE ของฐานข้อมูล: Prisma รับและคืนเป็น Date ที่เวลา 00:00 UTC ของวันนั้น
export function toDbDate(date: string): Date {
  return new Date(toUtcMs(date));
}

export function fromDbDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
