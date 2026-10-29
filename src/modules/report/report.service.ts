import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ApiException } from '../../common/api-exception.js';
import { fromDbDate, todayInBangkok } from '../../common/service-date.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  RoundsService,
  type ScheduleResolver,
} from '../rounds/rounds.service.js';
import type { UserType } from '../auth/domain/permissions.js';
import { roundLabel, type BookingType } from '../booking/domain/rounds.js';
import type { PaymentPlan } from '../payment/domain/schedule.js';
import {
  previousRange,
  summarizeLots,
  type LotSummary,
} from './domain/dashboard.js';
import { paymentState, type PaymentState } from './domain/payment-state.js';
import type { BookingReportQueryDto } from './dto/booking-report-query.dto.js';
import type { PaymentReportQueryDto } from './dto/payment-report-query.dto.js';

const MAX_RANGE_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// รายงานแสดงรายการได้ไม่เกินเท่านี้ต่อครั้ง เกินแล้วให้ผู้ใช้ย่อช่วงเวลา
const REPORT_ROW_LIMIT = 1000;

export type PaymentReportRow = {
  date: string; // วันที่ชำระตามเวลาไทย
  bookings: number;
  serviceAmount: number;
  fineAmount: number;
};

export type PaymentReport = {
  rows: PaymentReportRow[];
  totals: Omit<PaymentReportRow, 'date'>;
};

type BookingSource = 'SELF' | 'CUSTOMER_SERVICE' | 'IMPORT';

export type BookingReportRow = {
  id: number;
  bookingNo: string;
  createdAt: string;
  customerName: string;
  customerType: UserType;
  slots: string[];
  startDate: string;
  endDate: string;
  roundLabel: string;
  roundCount: number;
  type: BookingType;
  plan: PaymentPlan;
  source: BookingSource;
  state: PaymentState;
  totalAmount: number;
  paidAmount: number;
};

export type BookingReportTotals = {
  bookings: number;
  paidCount: number;
  pendingCount: number;
  cancelledCount: number;
  totalAmount: number;
  paidAmount: number;
  // ยอดที่ยังต้องชำระของรายการที่ไม่ถูกยกเลิก
  outstandingAmount: number;
  // ยอดรวมของรายการที่ถูกยกเลิก (Screen Design 8.1: การ์ด "ยกเลิกรายการ" แสดงทั้งจำนวนและยอด)
  cancelledAmount: number;
};

export type BookingReport = {
  rows: BookingReportRow[];
  // true = มีรายการมากกว่าที่แสดง ยอดรวมนับเฉพาะรายการที่แสดง
  truncated: boolean;
  totals: BookingReportTotals;
};

export type Dashboard = {
  truncated: boolean;
  totals: BookingReportTotals;
  // ยอดของช่วงก่อนหน้าที่ยาวเท่ากัน (ตัวกรองเดียวกัน) ใช้แสดง "เทียบกับช่วงก่อน"
  previous: BookingReportTotals;
  byCustomerType: { key: UserType; bookings: number }[];
  bySource: { key: BookingSource; bookings: number }[];
  byLot: LotSummary[];
  daily: { date: string; bookings: number; paidAmount: number }[];
};

const REPORT_BOOKING_INCLUDE = {
  customer: { select: { fullName: true, type: true } },
  slots: {
    include: {
      slot: { select: { code: true, lot: { select: { code: true } } } },
    },
  },
  days: { select: { amount: true, paidAt: true } },
} satisfies Prisma.BookingInclude;

type ReportBooking = Prisma.BookingGetPayload<{
  include: typeof REPORT_BOOKING_INCLUDE;
}>;

function assertRange(fromIso: string, toIso: string): { from: Date; to: Date } {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const rangeMs = to.getTime() - from.getTime();
  if (rangeMs < 0 || rangeMs > MAX_RANGE_DAYS * MS_PER_DAY) {
    throw new ApiException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'REPORT_RANGE_INVALID',
      `Range must be between 0 and ${MAX_RANGE_DAYS} days`,
    );
  }
  return { from, to };
}

function toRow(
  booking: ReportBooking,
  scheduleFor: ScheduleResolver,
): BookingReportRow {
  const unpaidDays = booking.days.filter((day) => day.paidAt === null).length;
  return {
    id: booking.id,
    bookingNo: booking.bookingNo,
    createdAt: booking.createdAt.toISOString(),
    customerName: booking.customer.fullName,
    customerType: booking.customer.type,
    slots: booking.slots.map((item) => item.slot.code).sort(),
    startDate: fromDbDate(booking.startDate),
    endDate: fromDbDate(booking.endDate),
    roundLabel: roundLabel(
      booking.startRound,
      scheduleFor(fromDbDate(booking.startDate)),
    ),
    roundCount: booking.roundCount,
    type: booking.type,
    plan: booking.paymentPlan,
    source: booking.source,
    state: paymentState(booking.status, unpaidDays),
    totalAmount: Number(booking.totalAmount),
    paidAmount: booking.days
      .filter((day) => day.paidAt !== null)
      .reduce((sum, day) => sum + Number(day.amount), 0),
  };
}

function totalsOf(rows: BookingReportRow[]): BookingReportTotals {
  const countOf = (state: PaymentState) =>
    rows.filter((row) => row.state === state).length;
  const sum = (pick: (row: BookingReportRow) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  return {
    bookings: rows.length,
    paidCount: countOf('PAID'),
    pendingCount: countOf('PENDING'),
    cancelledCount: countOf('CANCELLED'),
    totalAmount: sum((row) => row.totalAmount),
    paidAmount: sum((row) => row.paidAmount),
    outstandingAmount: sum((row) =>
      row.state === 'CANCELLED' ? 0 : row.totalAmount - row.paidAmount,
    ),
    cancelledAmount: sum((row) =>
      row.state === 'CANCELLED' ? row.totalAmount : 0,
    ),
  };
}

// นับจำนวนตาม key แล้วเรียงจากมากไปน้อย
function countBy<K extends string>(keys: K[]): { key: K; bookings: number }[] {
  const counts = new Map<K, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, bookings]) => ({ key, bookings }))
    .sort((a, b) => b.bookings - a.bookings);
}

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rounds: RoundsService,
  ) {}

  // สรุปยอดชำระค่าบริการและค่าปรับ แยกรายวัน นับเฉพาะรายการที่ชำระสำเร็จ
  async paymentSummary(query: PaymentReportQueryDto): Promise<PaymentReport> {
    const { from, to } = assertRange(query.from, query.to);
    const payments = await this.prisma.payment.findMany({
      where: { status: 'PAID', paidAt: { gte: from, lte: to } },
      select: { paidAt: true, purpose: true, amount: true, bookingId: true },
      orderBy: { paidAt: 'asc' },
    });

    const byDate = new Map<string, PaymentReportRow & { ids: Set<number> }>();
    for (const payment of payments) {
      const date = todayInBangkok(payment.paidAt ?? from);
      const row = byDate.get(date) ?? {
        date,
        bookings: 0,
        serviceAmount: 0,
        fineAmount: 0,
        ids: new Set<number>(),
      };
      if (payment.purpose === 'FINE') {
        row.fineAmount += Number(payment.amount);
      } else {
        row.serviceAmount += Number(payment.amount);
        if (payment.bookingId !== null) row.ids.add(payment.bookingId);
      }
      row.bookings = row.ids.size;
      byDate.set(date, row);
    }

    const rows = [...byDate.values()].map((row) => ({
      date: row.date,
      bookings: row.bookings,
      serviceAmount: row.serviceAmount,
      fineAmount: row.fineAmount,
    }));
    const total = (pick: (row: PaymentReportRow) => number) =>
      rows.reduce((sum, row) => sum + pick(row), 0);
    return {
      rows,
      totals: {
        bookings: total((row) => row.bookings),
        serviceAmount: total((row) => row.serviceAmount),
        fineAmount: total((row) => row.fineAmount),
      },
    };
  }

  // การจองที่ทำรายการในช่วงเวลา ใหม่สุดก่อน — ใช้ร่วมกันทั้งรายงานและแดชบอร์ด
  // range: ใช้แทนช่วงใน query (เช่น ช่วงก่อนหน้าของแดชบอร์ด) โดยคงตัวกรองอื่นไว้
  private async findBookings(
    query: BookingReportQueryDto,
    range?: { from: Date; to: Date },
  ): Promise<{ bookings: ReportBooking[]; truncated: boolean }> {
    const { from, to } = range ?? assertRange(query.from, query.to);
    const keyword = query.q?.trim();
    const found = await this.prisma.booking.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        type: query.type,
        paymentPlan: query.plan,
        source: query.source,
        ...(query.customerType
          ? { customer: { type: query.customerType } }
          : {}),
        ...(query.lot
          ? { slots: { some: { slot: { lot: { code: query.lot } } } } }
          : {}),
        ...(keyword
          ? {
              OR: [
                { bookingNo: { contains: keyword, mode: 'insensitive' } },
                {
                  customer: {
                    fullName: { contains: keyword, mode: 'insensitive' },
                  },
                },
                { customer: { phone: { contains: keyword } } },
              ],
            }
          : {}),
      },
      include: REPORT_BOOKING_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: REPORT_ROW_LIMIT + 1,
    });
    return {
      bookings: found.slice(0, REPORT_ROW_LIMIT),
      truncated: found.length > REPORT_ROW_LIMIT,
    };
  }

  // Screen Design ข้อ 8.1: รายการจองพร้อมสถานะการชำระ และยอดรวมของรายการที่แสดง
  async bookingReport(query: BookingReportQueryDto): Promise<BookingReport> {
    const { bookings, truncated } = await this.findBookings(query);
    const scheduleFor = await this.rounds.resolver();
    // สถานะการชำระคำนวณจากรายวัน จึงกรองหลังอ่านจากฐานข้อมูล
    const rows = bookings
      .map((booking) => toRow(booking, scheduleFor))
      .filter((row) => !query.state || row.state === query.state);
    return { rows, truncated, totals: totalsOf(rows) };
  }

  // Screen Design ข้อ 2.9: ภาพรวมการจอง การชำระเงิน และการใช้ลานจอดในช่วงเวลา
  async dashboard(query: BookingReportQueryDto): Promise<Dashboard> {
    const { from, to } = assertRange(query.from, query.to);
    const before = previousRange(from, to);
    const [{ bookings, truncated }, previous] = await Promise.all([
      this.findBookings(query),
      this.findBookings(query, before),
    ]);
    const scheduleFor = await this.rounds.resolver();
    const rows = bookings.map((booking) => toRow(booking, scheduleFor));
    const days = new Map<string, { bookings: number; paidAmount: number }>();
    for (const row of rows) {
      const date = todayInBangkok(new Date(row.createdAt));
      const entry = days.get(date) ?? { bookings: 0, paidAmount: 0 };
      entry.bookings += 1;
      entry.paidAmount += row.paidAmount;
      days.set(date, entry);
    }

    return {
      truncated,
      totals: totalsOf(rows),
      previous: totalsOf(
        previous.bookings.map((booking) => toRow(booking, scheduleFor)),
      ),
      byCustomerType: countBy(rows.map((row) => row.customerType)),
      bySource: countBy(rows.map((row) => row.source)),
      byLot: summarizeLots(
        bookings.map((booking, index) => ({
          lots: booking.slots.map(({ slot }) => slot.lot.code),
          paidAmount: rows[index].paidAmount,
        })),
      ),
      daily: [...days.entries()]
        .map(([date, entry]) => ({ date, ...entry }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
}
