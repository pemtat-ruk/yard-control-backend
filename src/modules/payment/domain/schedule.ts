import { bangkokInstant } from '../../../common/service-date.js';

export type PaymentPlan = 'FULL' | 'DAILY';

export type ScheduleInput = {
  dates: string[]; // วันบริการทั้งหมดของการจอง เรียงจากวันแรก
  slotCount: number;
  roundCount: number;
  pricePerSlotRound: number;
  plan: PaymentPlan;
  // เวลาที่ทำรายการ — วันที่เลยกำหนดชำระไปแล้วจะถูกรวมเข้ายอดชำระทันที
  now?: Date;
};

export type Installment = {
  coversDates: string[];
  amount: number;
  // null = ชำระทันทีเมื่อกดยืนยันการจอง
  dueAt: Date | null;
};

// ข้อ 6.1
// FULL  : ชำระเต็มจำนวนทันที
// DAILY : ชำระ 1 วันทันที (หักเป็นค่าบริการวันสุดท้าย) ส่วนวันที่เหลือชำระภายในเที่ยงคืนก่อนวันใช้งานจริง
export function buildPaymentSchedule(input: ScheduleInput): Installment[] {
  const { dates, slotCount, roundCount, pricePerSlotRound, plan, now } = input;
  if (dates.length === 0) {
    throw new Error('Booking must cover at least one day');
  }
  const dailyAmount = slotCount * roundCount * pricePerSlotRound;

  if (plan === 'FULL') {
    return [
      { coversDates: dates, amount: dailyAmount * dates.length, dueAt: null },
    ];
  }
  if (dates.length < 2) {
    throw new Error(
      'Daily payment plan is only available for long-term bookings',
    );
  }

  const lastDate = dates[dates.length - 1];
  const earlier = dates.slice(0, -1).map((date) => ({
    date,
    dueAt: bangkokInstant(date, 0),
  }));
  // [ถาม ข้อ 12] วันที่กำหนดชำระ (เที่ยงคืนก่อนวันใช้งาน) ผ่านไปแล้วตอนจอง เช่น จองวันนี้เริ่มวันนี้
  // ตีความว่าต้องชำระพร้อมกันตอนจอง ไม่เช่นนั้นการจองจะถูกยกเลิกทันทีที่สร้าง
  const isOverdue = (dueAt: Date) =>
    now !== undefined && dueAt.getTime() <= now.getTime();
  const payNowDates = [
    ...earlier.filter((day) => isOverdue(day.dueAt)).map((day) => day.date),
    lastDate,
  ];

  return [
    {
      coversDates: payNowDates,
      amount: dailyAmount * payNowDates.length,
      dueAt: null,
    },
    ...earlier
      .filter((day) => !isOverdue(day.dueAt))
      .map((day) => ({
        coversDates: [day.date],
        amount: dailyAmount,
        dueAt: day.dueAt,
      })),
  ];
}
