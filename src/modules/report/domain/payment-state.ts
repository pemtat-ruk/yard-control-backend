// ข้อ 8: สถานะการชำระของการจองหนึ่งรายการในรายงานและแดชบอร์ด
export type PaymentState = 'PAID' | 'PENDING' | 'CANCELLED';

export type ReportBookingStatus =
  'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

// การจองแบบวันต่อวันที่ยังมีวันค้างชำระ นับเป็นรอชำระแม้จะยืนยันแล้ว
export function paymentState(
  status: ReportBookingStatus,
  unpaidDays: number,
): PaymentState {
  if (status === 'CANCELLED') return 'CANCELLED';
  return status === 'PENDING_PAYMENT' || unpaidDays > 0 ? 'PENDING' : 'PAID';
}
