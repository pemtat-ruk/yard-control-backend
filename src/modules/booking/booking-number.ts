import { randomUUID } from 'node:crypto';
import { todayInBangkok } from '../../common/service-date.js';

const BOOKING_NO_ID_DIGITS = 5;
// คอลัมน์ booking_no ยาวได้ 30 ตัวอักษร
const TEMP_BOOKING_NO_LENGTH = 30;

// เลขที่จริงต้องใช้ id ที่ฐานข้อมูลออกให้ จึงบันทึกค่าชั่วคราวก่อนแล้วเปลี่ยนเป็น bookingNoFor()
export function tempBookingNo(): string {
  return randomUUID().slice(0, TEMP_BOOKING_NO_LENGTH);
}

// BK + วันที่ทำรายการ (YYMMDD เวลาไทย) + id 5 หลัก
export function bookingNoFor(id: number, now: Date): string {
  const dayPart = todayInBangkok(now).replaceAll('-', '').slice(2);
  return `BK${dayPart}${String(id).padStart(BOOKING_NO_ID_DIGITS, '0')}`;
}
