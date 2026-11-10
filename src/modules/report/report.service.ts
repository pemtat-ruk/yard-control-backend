import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ApiException } from '../../common/api-exception.js';
import { todayInBangkok } from '../../common/service-date.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  RoundsService,
  type ScheduleResolver,
} from '../rounds/rounds.service.js';
import type { UserType } from '../auth/domain/permissions.js';
import { customerName, userTypeOf } from '../auth/domain/customer.js';
import {
  BOOKING_INCLUDE,
  toBookingView,
  type BookingRecord,
} from '../booking/booking-record.js';
import {
  BOOKING_CANCELLED,
  BOOKING_TYPE_CODE,
  PAYMENT_TYPE_CODE,
} from '../booking/domain/booking-status.js';
import type { BookingType } from '../booking/domain/rounds.js';
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

// การชำระหนึ่งครั้ง: ref = เลขที่การจอง (ค่าบริการ) หรือเลขที่ค่าปรับ
export type PaymentItem = {
  paidAt: string;
  purpose: 'BOOKING' | 'FINE';
  ref: string | null;
  customerName: string | null;
  amount: number;
};
export type PaymentItems = { items: PaymentItem[]; truncated: boolean };

type BookingSource = 'SELF' | 'CUSTOMER_SERVICE' | 'IMPORT';

export type BookingReportRow = {
  id: string;
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
  // ยกเลิกแล้ว: เหตุที่ระบบยกเลิก (ไม่ชำระ QR ตอนจอง / ไม่ชำระค่าบริการรายวัน) และเวลาที่ยกเลิก
  cancelReason: string | null;
  cancelledAt: string | null;
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
  ...BOOKING_INCLUDE,
  customer: {
    select: { firstName: true, lastName: true, cusType: true },
  },
} satisfies Prisma.BookingHeaderInclude;

type ReportBooking = BookingRecord &
  Prisma.BookingHeaderGetPayload<{ include: typeof REPORT_BOOKING_INCLUDE }>;

// ลูกค้าจองเอง = ผู้สร้างคือลูกค้าเอง; นำเข้าไฟล์ = BookingChannel I; นอกนั้นฝ่ายบริการลูกค้าจองแทน
function sourceOf(booking: ReportBooking): BookingSource {
  if (booking.bookingChannel === 'I') return 'IMPORT';
  return booking.createdBy === booking.bookingCusId
    ? 'SELF'
    : 'CUSTOMER_SERVICE';
}

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
  now: Date,
  scheduleFor: ScheduleResolver,
): BookingReportRow {
  const view = toBookingView(booking, now, todayInBangkok(now), scheduleFor);
  const unpaidDays = view.days.filter((day) => !day.paid).length;
  return {
    id: view.id,
    bookingNo: view.bookingNo,
    createdAt: booking.createdDate.toISOString(),
    customerName: view.customerName,
    customerType: userTypeOf(booking.customer.cusType),
    slots: view.slots,
    startDate: view.startDate,
    endDate: view.endDate,
    roundLabel: view.roundLabel,
    roundCount: view.roundCount,
    type: view.type,
    plan: view.plan,
    source: sourceOf(booking),
    state: paymentState(view.status, unpaidDays),
    cancelReason: view.cancelReason,
    cancelledAt:
      booking.bookingStatus === BOOKING_CANCELLED
        ? (booking.updatedDate?.toISOString() ?? null)
        : null,
    totalAmount: view.totalAmount,
    paidAmount: view.paidAmount,
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
    const payments = await this.prisma.paymentTransaction.findMany({
      where: { status: 'PAID', paidAt: { gte: from, lte: to } },
      select: { paidAt: true, purpose: true, amount: true, bookingNo: true },
      orderBy: { paidAt: 'asc' },
    });

    const byDate = new Map<string, PaymentReportRow & { ids: Set<string> }>();
    for (const payment of payments) {
      const date = todayInBangkok(payment.paidAt ?? from);
      const row = byDate.get(date) ?? {
        date,
        bookings: 0,
        serviceAmount: 0,
        fineAmount: 0,
        ids: new Set<string>(),
      };
      if (payment.purpose === 'FINE') {
        row.fineAmount += Number(payment.amount);
      } else {
        row.serviceAmount += Number(payment.amount);
        if (payment.bookingNo !== null) row.ids.add(payment.bookingNo);
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
  // ยอดของรายการทั้งหมดเท่ากับ paymentSummary ของช่วงเดียวกัน (เงื่อนไขเดียวกัน: PAID และ paidAt ในช่วง)
  async paymentItems(query: PaymentReportQueryDto): Promise<PaymentItems> {
    const { from, to } = assertRange(query.from, query.to);
    const customer = { select: { firstName: true, lastName: true } } as const;
    const payments = await this.prisma.paymentTransaction.findMany({
      where: { status: 'PAID', paidAt: { gte: from, lte: to } },
      select: {
        paidAt: true,
        purpose: true,
        amount: true,
        bookingNo: true,
        booking: { select: { customer } },
        fine: {
          select: {
            fineNo: true,
            cusId: true,
            booking: { select: { customer } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      take: REPORT_ROW_LIMIT + 1,
    });
    // ค่าปรับที่ไม่ผูกการจอง: หาชื่อจากรหัสลูกค้าครั้งเดียว
    const fineCusIds = [
      ...new Set(
        payments.flatMap((payment) =>
          payment.fine && !payment.fine.booking && payment.fine.cusId
            ? [payment.fine.cusId]
            : [],
        ),
      ),
    ];
    const customers =
      fineCusIds.length === 0
        ? []
        : await this.prisma.cRMCustomer.findMany({
            where: { cusId: { in: fineCusIds } },
            select: { cusId: true, firstName: true, lastName: true },
          });
    const nameOf = new Map(
      customers.map((row) => [row.cusId, customerName(row)]),
    );

    const items = payments
      .slice(0, REPORT_ROW_LIMIT)
      .map((payment): PaymentItem => {
        const isFine = payment.purpose === 'FINE';
        const owner = isFine
          ? payment.fine?.booking?.customer
          : payment.booking?.customer;
        return {
          paidAt: (payment.paidAt ?? from).toISOString(),
          purpose: isFine ? 'FINE' : 'BOOKING',
          ref: isFine ? (payment.fine?.fineNo ?? null) : payment.bookingNo,
          customerName: owner
            ? customerName(owner)
            : (nameOf.get(payment.fine?.cusId ?? '') ?? null),
          amount: Number(payment.amount),
        };
      });
    return { items, truncated: payments.length > REPORT_ROW_LIMIT };
  }

  private async findBookings(
    query: BookingReportQueryDto,
    range?: { from: Date; to: Date },
  ): Promise<{ bookings: ReportBooking[]; truncated: boolean }> {
    const { from, to } = range ?? assertRange(query.from, query.to);
    const keyword = query.q?.trim();
    const found = await this.prisma.bookingHeader.findMany({
      where: {
        createdDate: { gte: from, lte: to },
        bookingType: query.type ? BOOKING_TYPE_CODE[query.type] : undefined,
        paymentType: query.plan ? PAYMENT_TYPE_CODE[query.plan] : undefined,
        ...(query.source === 'IMPORT' ? { bookingChannel: 'I' } : {}),
        ...(query.source && query.source !== 'IMPORT'
          ? { bookingChannel: 'N' }
          : {}),
        ...(query.customerType
          ? {
              customer: {
                cusType:
                  query.customerType === 'GREEN_SHIRT' ? 'Labor' : 'buyer',
              },
            }
          : {}),
        ...(query.lot
          ? {
              details: {
                some: {
                  slot: { parking: { extra: { code: query.lot } } },
                },
              },
            }
          : {}),
        ...(keyword
          ? {
              OR: [
                { bookingNo: { contains: keyword } },
                { customer: { firstName: { contains: keyword } } },
                { customer: { lastName: { contains: keyword } } },
                { customer: { telephone: { contains: keyword } } },
              ],
            }
          : {}),
      },
      include: REPORT_BOOKING_INCLUDE,
      orderBy: { createdDate: 'desc' },
      take: REPORT_ROW_LIMIT + 1,
    });
    // จองเอง / จองแทน แยกด้วยการเทียบผู้สร้างกับลูกค้า จึงกรองหลังอ่าน
    const matched = query.source
      ? found.filter((booking) => sourceOf(booking) === query.source)
      : found;
    return {
      bookings: matched.slice(0, REPORT_ROW_LIMIT),
      truncated: found.length > REPORT_ROW_LIMIT,
    };
  }

  // Screen Design ข้อ 8.1: รายการจองพร้อมสถานะการชำระ และยอดรวมของรายการที่แสดง
  async bookingReport(query: BookingReportQueryDto): Promise<BookingReport> {
    const { bookings, truncated } = await this.findBookings(query);
    const now = new Date();
    const scheduleFor = await this.rounds.resolver();
    // สถานะการชำระคำนวณจากรายวัน จึงกรองหลังอ่านจากฐานข้อมูล
    const rows = bookings
      .map((booking) => toRow(booking, now, scheduleFor))
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
    const now = new Date();
    const scheduleFor = await this.rounds.resolver();
    const rows = bookings.map((booking) => toRow(booking, now, scheduleFor));
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
        previous.bookings.map((booking) => toRow(booking, now, scheduleFor)),
      ),
      byCustomerType: countBy(rows.map((row) => row.customerType)),
      bySource: countBy(rows.map((row) => row.source)),
      byLot: summarizeLots(
        bookings.map((booking, index) => ({
          lots: booking.details.map(
            (detail) => detail.slot.parking.extra?.code ?? '',
          ),
          paidAmount: rows[index].paidAmount,
        })),
      ),
      daily: [...days.entries()]
        .map(([date, entry]) => ({ date, ...entry }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
}
