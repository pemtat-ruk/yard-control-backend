// สถานะการจองที่หน้าเว็บใช้ — คิดจาก BookingHeader.BookingStatus (A/C) + PaymentStatus (W/P/O/C) + วันใช้งาน
// CANCELLED = ยกเลิกอัตโนมัติเมื่อไม่ชำระตามกำหนด — ไม่คืนเงิน
export type BookingStatus =
  'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export type CancelReason = 'PAYMENT_EXPIRED' | 'DAILY_PAYMENT_OVERDUE';

// รหัสตามตาราง Master ของ SA
export const BOOKING_ACTIVE = 'A';
export const BOOKING_CANCELLED = 'C';
export const PAY_WAITING = 'W';
export const PAY_PAID = 'P';
export const PAY_OVERDUE = 'O';
export const PAY_CANCELLED = 'C';

export const CHANNEL_NORMAL = 'N';
export const CHANNEL_IMPORT = 'I';

type HeaderCodes = {
  bookingStatus: string;
  paymentStatus: string;
  bookingChannel: string;
};

// การจองยืนยันเมื่อชำระงวดแรก (PaymentStatus = P); การจองที่นำเข้าจากไฟล์ยืนยันทันที (ชำระรายวันทุกวัน)
export function isConfirmed(header: HeaderCodes): boolean {
  return (
    header.bookingStatus === BOOKING_ACTIVE &&
    (header.paymentStatus !== PAY_WAITING ||
      header.bookingChannel === CHANNEL_IMPORT)
  );
}

// เงื่อนไขเดียวกับ isConfirmed สำหรับ where ของ Prisma (BookingHeader)
export const CONFIRMED_BOOKING = {
  bookingStatus: BOOKING_ACTIVE,
  OR: [
    { paymentStatus: { not: PAY_WAITING } },
    { bookingChannel: CHANNEL_IMPORT },
  ],
};

// วันใช้งานสุดท้ายผ่านไปแล้ว = เสร็จสิ้น
export function bookingStatusOf(
  header: HeaderCodes,
  lastDate: string,
  today: string,
): BookingStatus {
  if (header.bookingStatus === BOOKING_CANCELLED) return 'CANCELLED';
  if (!isConfirmed(header)) return 'PENDING_PAYMENT';
  return lastDate < today ? 'COMPLETED' : 'CONFIRMED';
}

// ยกเลิกเพราะ QR แรกหมดอายุ = PaymentStatus C; เพราะงวดรายวันเกินกำหนด = O
export function cancelReasonOf(header: {
  bookingStatus: string;
  paymentStatus: string;
}): CancelReason | null {
  if (header.bookingStatus !== BOOKING_CANCELLED) return null;
  return header.paymentStatus === PAY_OVERDUE
    ? 'DAILY_PAYMENT_OVERDUE'
    : 'PAYMENT_EXPIRED';
}

// ประเภทการจองและการชำระ: รหัสของ SA ↔ ค่าที่หน้าเว็บใช้
export const BOOKING_TYPE_CODE = { SHORT: 'S', LONG: 'L' } as const;
export const PAYMENT_TYPE_CODE = { FULL: 'F', DAILY: 'D' } as const;

export function bookingTypeOf(code: string): 'SHORT' | 'LONG' {
  return code === BOOKING_TYPE_CODE.LONG ? 'LONG' : 'SHORT';
}

export function paymentPlanOf(code: string): 'FULL' | 'DAILY' {
  return code === PAYMENT_TYPE_CODE.DAILY ? 'DAILY' : 'FULL';
}

// ตั๋วเข้าลานไม่มีตาราง: เลขตั๋ว = TK + เลขใบจอง (ไม่มี BK และขีด) + วันใช้งาน
// BK2026-11-0001 วันที่ 2026-11-10 → TK202611000120261110
export function ticketNoFor(bookingNo: string, serviceDate: string): string {
  return `TK${bookingNo.slice(2).replaceAll('-', '')}${serviceDate.replaceAll('-', '')}`;
}

const TICKET_PATTERN = /^TK(\d{4})(\d{2})(\d{4})\d{8}$/;

// เลขตั๋ว (พิมพ์หรือยิงบาร์โค้ดที่ป้อม) → เลขใบจอง
export function bookingNoOfTicket(text: string): string | null {
  const match = TICKET_PATTERN.exec(text.trim().toUpperCase());
  return match ? `BK${match[1]}-${match[2]}-${match[3]}` : null;
}
