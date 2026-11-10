import {
  BANGKOK_OFFSET,
  fromDbDate,
  toDbDate,
} from '../../../common/service-date.js';

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

// PaymentSchedule เก็บกำหนดชำระเป็น DueDate (Date) + DueTime (Time) ตามเวลาไทย
// คอลัมน์ Time รับ-ส่งผ่าน Prisma เป็น Date วันที่ 1970-01-01 UTC
export function toDueColumns(instant: Date): { dueDate: Date; dueTime: Date } {
  const local = new Date(instant.getTime() + BANGKOK_OFFSET_MS);
  const date = local.toISOString().slice(0, 10);
  return {
    dueDate: toDbDate(date),
    dueTime: new Date(
      Date.UTC(
        1970,
        0,
        1,
        local.getUTCHours(),
        local.getUTCMinutes(),
        local.getUTCSeconds(),
      ),
    ),
  };
}

export function fromDueColumns(dueDate: Date, dueTime: Date): Date {
  const time = dueTime.toISOString().slice(11, 19);
  return new Date(`${fromDbDate(dueDate)}T${time}${BANGKOK_OFFSET}`);
}
