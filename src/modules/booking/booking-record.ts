import type { Prisma } from '@prisma/client';
import { fromDbDate } from '../../common/service-date.js';
import { customerName } from '../auth/domain/customer.js';
import { storedVat, type VatBreakdown } from '../payment/domain/vat.js';
import { fromDueColumns } from '../payment/domain/due.js';
import type { PaymentPlan } from '../payment/domain/schedule.js';
import { SLOT_WITH_LOT, sortedDbLabels } from '../yard/domain/slot-label.js';
import {
  summarizeDetails,
  type BookingShape,
} from './domain/booking-details.js';
import {
  bookingStatusOf,
  bookingTypeOf,
  cancelReasonOf,
  PAY_PAID,
  paymentPlanOf,
  ticketNoFor,
  type BookingStatus,
} from './domain/booking-status.js';
import { roundLabel, roundsPerDay, type BookingType } from './domain/rounds.js';
import type { ScheduleResolver } from '../rounds/rounds.service.js';

export type BookingView = {
  id: string; // BookingNo
  bookingNo: string;
  type: BookingType;
  plan: PaymentPlan;
  status: BookingStatus;
  cancelReason: string | null;
  customerName: string;
  startDate: string;
  endDate: string;
  roundLabel: string;
  roundCount: number;
  slots: string[];
  totalAmount: number;
  paidAmount: number;
  // QR ที่รอสแกน และวันบริการที่ QR นี้ชำระ (dates)
  pendingPayment: {
    id: number;
    amount: number;
    expiresAt: string;
    dates: string[];
  } | null;
  days: { date: string; amount: number; dueAt: string; paid: boolean }[];
  tickets: { ticketNo: string; serviceDate: string }[];
  // ใบเสร็จ: เลขธุรกรรมของการชำระ และวันบริการที่ใบนี้ชำระ (ข้อ 5 หลักฐานการชำระ)
  receipts: {
    receiptNo: string;
    transactionNo: string;
    amount: number;
    // ใบกำกับภาษีอย่างย่อ: ยอดรวมภาษีแล้ว แยกมูลค่าก่อนภาษีและภาษี
    vat: VatBreakdown;
    issuedAt: string;
    dates: string[];
  }[];
};

// ใบจอง + รายละเอียด + งวดชำระ + ธุรกรรม QR — ทุกส่วนที่แสดงการจองโหลดด้วย include นี้
export const BOOKING_INCLUDE = {
  customer: { select: { firstName: true, lastName: true } },
  details: {
    select: {
      bookingDetailId: true,
      usageDate: true,
      round: { select: { roundSequence: true } },
      parkingSlotId: true,
      slot: { select: SLOT_WITH_LOT },
    },
  },
  schedules: {
    orderBy: { sequenceNo: 'asc' },
    include: {
      detail: { select: { usageDate: true } },
      transactions: { select: { paymentId: true } },
    },
  },
  transactions: { include: { receipt: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.BookingHeaderInclude;

export type BookingRecord = Prisma.BookingHeaderGetPayload<{
  include: typeof BOOKING_INCLUDE;
}>;

// วันบริการของงวด: วันของ BookingDetail ที่งวดอ้าง (ไม่มี = วันกำหนดชำระ)
export function scheduleDate(schedule: BookingRecord['schedules'][number]) {
  return fromDbDate(schedule.detail?.usageDate ?? schedule.dueDate);
}

export function shapeOf(
  booking: Pick<BookingRecord, 'details'>,
  scheduleFor: ScheduleResolver,
): BookingShape {
  const keys = booking.details.map((detail) => ({
    serviceDate: fromDbDate(detail.usageDate),
    roundIndex: detail.round.roundSequence - 1,
    slotId: Number(detail.parkingSlotId),
  }));
  const firstDate = keys.map((key) => key.serviceDate).sort()[0];
  return summarizeDetails(
    keys,
    firstDate ? roundsPerDay(scheduleFor(firstDate)) : 1,
  );
}

function sumAmounts(items: { amount: number }[]): number {
  return items.reduce((total, item) => total + item.amount, 0);
}

export function toBookingView(
  booking: BookingRecord,
  now: Date,
  today: string,
  scheduleFor: ScheduleResolver,
): BookingView {
  const shape = shapeOf(booking, scheduleFor);
  const startDate = shape.dates[0] ?? today;
  const endDate = shape.dates.at(-1) ?? startDate;
  const pending = booking.transactions.find(
    (payment) => payment.status === 'PENDING' && payment.expiresAt > now,
  );
  const datesOf = (paymentId: number) =>
    booking.schedules
      .filter((schedule) =>
        schedule.transactions.some((item) => item.paymentId === paymentId),
      )
      .map(scheduleDate);
  const days = booking.schedules.map((schedule) => ({
    date: scheduleDate(schedule),
    amount: Number(schedule.amountDue),
    dueAt: fromDueColumns(schedule.dueDate, schedule.dueTime).toISOString(),
    paid: schedule.paymentStatus === PAY_PAID,
  }));
  return {
    id: booking.bookingNo,
    bookingNo: booking.bookingNo,
    type: bookingTypeOf(booking.bookingType),
    plan: paymentPlanOf(booking.paymentType),
    status: bookingStatusOf(booking, endDate, today),
    cancelReason: cancelReasonOf(booking),
    customerName: customerName(booking.customer),
    startDate,
    endDate,
    roundLabel: roundLabel(shape.startRound, scheduleFor(startDate)),
    roundCount: shape.roundCount,
    slots: sortedDbLabels(booking.details.map((detail) => detail.slot)),
    totalAmount: Number(booking.totalAmount),
    paidAmount: sumAmounts(days.filter((day) => day.paid)),
    pendingPayment: pending
      ? {
          id: pending.id,
          amount: Number(pending.amount),
          expiresAt: pending.expiresAt.toISOString(),
          dates: datesOf(pending.id),
        }
      : null,
    days,
    tickets: days
      .filter((day) => day.paid)
      .map((day) => ({
        ticketNo: ticketNoFor(booking.bookingNo, day.date),
        serviceDate: day.date,
      })),
    receipts: booking.transactions.flatMap((payment) =>
      payment.receipt
        ? [
            {
              receiptNo: payment.receipt.receiptNo,
              transactionNo: payment.transactionNo,
              amount: Number(payment.amount),
              vat: storedVat(payment.receipt),
              issuedAt: payment.receipt.issuedAt.toISOString(),
              dates: datesOf(payment.id),
            },
          ]
        : [],
    ),
  };
}
