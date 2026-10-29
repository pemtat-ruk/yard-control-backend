import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../../common/api-exception.js';
import {
  addDays,
  fromDbDate,
  toDbDate,
  todayInBangkok,
} from '../../common/service-date.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { hasPermission, type UserType } from '../auth/domain/permissions.js';
import {
  buildPaymentSchedule,
  type Installment,
  type PaymentPlan,
} from '../payment/domain/schedule.js';
import { PaymentService } from '../payment/payment.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { isBookableBy, resolveStatus } from '../yard/domain/slot-status.js';
import { continuesInNextRound } from './booking-continuation.js';
import { bookingNoFor, tempBookingNo } from './booking-number.js';
import {
  bookedDatesWithin,
  classifyBooking,
  expandRounds,
  firstOpenRound,
  listRounds,
  MAX_ADVANCE_DAYS,
  roundAfterUsage,
  roundsPerDay,
  roundLabel,
  serviceDates,
  usageWindow,
  validateBookingRequest,
  type BookingRequest,
  type BookingType,
  type RoundSchedule,
} from './domain/rounds.js';
import {
  RoundsService,
  type ScheduleResolver,
} from '../rounds/rounds.service.js';
import type {
  BookingScope,
  CreateBookingDto,
  ListBookingsQueryDto,
  PayDaysDto,
} from './dto/create-booking.dto.js';
import type { QuoteBookingDto } from './dto/quote-booking.dto.js';
import { SettingsService } from '../settings/settings.service.js';
import { storedVat, type VatBreakdown } from '../payment/domain/vat.js';

export type RoundsConfig = {
  roundHours: number;
  // ชั่วโมงเริ่มรอบแรกของวันบริการ (ตารางรอบของวันที่ขอ)
  firstHour: number;
  maxAdvanceDays: number;
  today: string;
  // วันบริการที่ใช้ตารางรอบนี้ (ค่าเริ่มต้น = วันนี้)
  date: string;
  // รอบแรกของวันนั้นที่ยังจองได้ (วันนี้: รอบก่อนหน้าจบไปแล้ว; วันข้างหน้า: 0)
  firstOpenRound: number;
  rounds: { index: number; label: string }[];
};

export type BookingQuote = {
  type: BookingType;
  plan: PaymentPlan;
  pricePerSlotRound: number;
  totalAmount: number;
  payNowAmount: number;
  installments: {
    coversDates: string[];
    amount: number;
    dueAt: string | null;
  }[];
};

export type BookingView = {
  id: number;
  bookingNo: string;
  type: BookingType;
  plan: PaymentPlan;
  status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  cancelReason: string | null;
  customerName: string;
  startDate: string;
  endDate: string;
  roundLabel: string;
  roundCount: number;
  slots: string[];
  totalAmount: number;
  paidAmount: number;
  // รายการที่กำลังรอชำระ (QR ยังไม่หมดอายุ)
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

// การใช้ช่องจอดหนึ่งวันบริการของผู้ขอใช้บริการ ที่กำลังใช้อยู่หรือยังมาไม่ถึง
export type ScheduleEntry = {
  bookingId: number;
  bookingNo: string;
  serviceDate: string;
  slots: string[];
  slotIds: number[];
  startsAt: string;
  endsAt: string;
  active: boolean;
  // รอบถัดไปที่จองต่อได้ (เฉพาะรายการที่กำลังใช้อยู่); null = จองช่องเดิมรอบถัดไปไว้แล้ว หรือยังไม่ถึงเวลาใช้
  extend: { date: string; startRound: number } | null;
};

export type BookingSchedule = {
  now: string;
  // เหลือเวลาไม่เกินเท่านี้ให้หน้าจอถามว่าต้องการจองต่อหรือไม่ (ข้อ 4)
  warnMinutes: number;
  entries: ScheduleEntry[];
};

export type CustomerView = {
  id: number;
  name: string;
  phone: string | null;
  userType: UserType;
};

const BOOKING_INCLUDE = {
  customer: { select: { fullName: true } },
  slots: { include: { slot: { select: { code: true } } } },
  days: { orderBy: { serviceDate: 'asc' } },
  payments: { include: { receipt: true }, orderBy: { id: 'asc' } },
  tickets: { orderBy: { serviceDate: 'asc' } },
} satisfies Prisma.BookingInclude;

type BookingRecord = Prisma.BookingGetPayload<{
  include: typeof BOOKING_INCLUDE;
}>;

const MS_PER_MINUTE = 60 * 1000;
const LIST_LIMIT = 100;
// รายการจองทีละหน้า (โหลดต่อด้วย before)
export const BOOKING_PAGE_SIZE = 50;
const CUSTOMER_SEARCH_LIMIT = 20;
export const CUSTOMER_TYPES: UserType[] = ['BUYER', 'GREEN_SHIRT'];

function scopeWhere(
  scope: BookingScope,
  today: string,
): Prisma.BookingWhereInput {
  if (scope === 'PENDING') {
    return {
      OR: [
        { status: 'PENDING_PAYMENT' },
        { status: 'CONFIRMED', days: { some: { paidAt: null } } },
      ],
    };
  }
  if (scope === 'ACTIVE') {
    return {
      status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] },
      endDate: { gte: toDbDate(today) },
    };
  }
  return {};
}

function sumAmounts(items: { amount: number }[]): number {
  return items.reduce((total, item) => total + item.amount, 0);
}

const SATANG_PER_BAHT = 100;

// เทียบยอดเงินระดับสตางค์ (ทศนิยมของ number บวกกันแล้วอาจคลาดเล็กน้อย)
function sameMoney(a: number, b: number): boolean {
  return Math.round(a * SATANG_PER_BAHT) === Math.round(b * SATANG_PER_BAHT);
}

function toView(
  booking: BookingRecord,
  now: Date,
  scheduleFor: ScheduleResolver,
): BookingView {
  const pending = booking.payments.find(
    (payment) => payment.status === 'PENDING' && payment.expiresAt > now,
  );
  const days = booking.days.map((day) => ({
    date: fromDbDate(day.serviceDate),
    amount: Number(day.amount),
    dueAt: day.dueAt.toISOString(),
    paid: day.paidAt !== null,
  }));
  return {
    id: booking.id,
    bookingNo: booking.bookingNo,
    type: booking.type,
    plan: booking.paymentPlan,
    status: booking.status,
    cancelReason: booking.cancelReason,
    customerName: booking.customer.fullName,
    startDate: fromDbDate(booking.startDate),
    endDate: fromDbDate(booking.endDate),
    roundLabel: roundLabel(
      booking.startRound,
      scheduleFor(fromDbDate(booking.startDate)),
    ),
    roundCount: booking.roundCount,
    slots: booking.slots.map((item) => item.slot.code).sort(),
    totalAmount: Number(booking.totalAmount),
    paidAmount: sumAmounts(days.filter((day) => day.paid)),
    pendingPayment: pending
      ? {
          id: pending.id,
          amount: Number(pending.amount),
          expiresAt: pending.expiresAt.toISOString(),
          dates: booking.days
            .filter((day) => day.paymentId === pending.id)
            .map((day) => fromDbDate(day.serviceDate)),
        }
      : null,
    days,
    tickets: booking.tickets.map((ticket) => ({
      ticketNo: ticket.ticketNo,
      serviceDate: fromDbDate(ticket.serviceDate),
    })),
    receipts: booking.payments.flatMap((payment) =>
      payment.receipt
        ? [
            {
              receiptNo: payment.receipt.receiptNo,
              transactionNo: payment.transactionNo,
              amount: Number(payment.amount),
              vat: storedVat(payment.receipt),
              issuedAt: payment.receipt.issuedAt.toISOString(),
              dates: booking.days
                .filter((day) => day.paymentId === payment.id)
                .map((day) => fromDbDate(day.serviceDate)),
            },
          ]
        : [],
    ),
  };
}

const sameDates = (a: string[], b: string[]) =>
  a.length === b.length && a.every((date) => b.includes(date));

function notFound(): ApiException {
  return new ApiException(
    HttpStatus.NOT_FOUND,
    'RECORD_NOT_FOUND',
    'Booking not found',
  );
}

function denied(): ApiException {
  return new ApiException(
    HttpStatus.FORBIDDEN,
    'PERMISSION_DENIED',
    'You do not have permission for this action',
  );
}

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly payments: PaymentService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly rounds: RoundsService,
  ) {}

  // ตารางรอบของวันบริการที่ขอ (ไม่ส่ง = วันนี้) — ตารางรอบเปลี่ยนได้แบบมีผลตั้งแต่วันที่ หน้าจองจึงถามรายวัน
  async getRoundsConfig(
    date?: string,
    now: Date = new Date(),
  ): Promise<RoundsConfig> {
    const today = todayInBangkok(now);
    const serviceDate = date ?? today;
    const schedule = (await this.rounds.resolver())(serviceDate);
    return {
      roundHours: schedule.roundHours,
      firstHour: schedule.firstHour,
      maxAdvanceDays: MAX_ADVANCE_DAYS,
      today,
      date: serviceDate,
      firstOpenRound:
        serviceDate < today
          ? roundsPerDay(schedule)
          : firstOpenRound(serviceDate, now, schedule),
      rounds: listRounds(schedule),
    };
  }

  // ตรวจกติกาการจองและสร้างตารางชำระเงิน — ใช้ร่วมกันทั้งตอนคำนวณยอดและตอนสร้างการจองจริง
  private async plan(
    request: BookingRequest & { plan: PaymentPlan; slotCount: number },
    now: Date,
  ): Promise<{
    type: BookingType;
    price: number;
    dates: string[];
    installments: Installment[];
    schedule: RoundSchedule;
  }> {
    const scheduleFor = await this.rounds.resolver();
    const ruleErrors = validateBookingRequest(
      request,
      todayInBangkok(now),
      scheduleFor,
      now,
    );
    if (ruleErrors.length > 0) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'BOOKING_INVALID',
        'Booking request breaks booking rules',
        ruleErrors,
      );
    }
    const type = classifyBooking(request);
    if (type === 'SHORT' && request.plan === 'DAILY') {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PAYMENT_PLAN_NOT_ALLOWED',
        'Daily payment plan is only available for long-term bookings',
      );
    }
    // ใช้อัตรา ณ วันบริการแรกตลอดทั้งการจอง
    const price = await this.pricing.priceFor(request.startDate);
    // วันที่จองจริง (ไม่รวมวันที่ขอข้าม) — คิดเงินและออกตั๋วเฉพาะวันเหล่านี้
    const dates = serviceDates(request);
    const installments = buildPaymentSchedule({
      dates,
      slotCount: request.slotCount,
      roundCount: request.roundCount,
      pricePerSlotRound: price,
      plan: request.plan,
      now,
    });
    return {
      type,
      price,
      dates,
      installments,
      schedule: scheduleFor(request.startDate),
    };
  }

  // คำนวณยอดและตารางชำระเงินโดยยังไม่สร้างการจอง — ให้หน้าจอแสดงสรุปก่อนยืนยัน
  async quote(
    dto: QuoteBookingDto,
    now: Date = new Date(),
  ): Promise<BookingQuote> {
    const { type, price, installments } = await this.plan(dto, now);
    return {
      type,
      plan: dto.plan,
      pricePerSlotRound: price,
      totalAmount: sumAmounts(installments),
      payNowAmount: sumAmounts(
        installments.filter((item) => item.dueAt === null),
      ),
      installments: installments.map((item) => ({
        ...item,
        dueAt: item.dueAt?.toISOString() ?? null,
      })),
    };
  }

  async create(
    user: AuthUser,
    dto: CreateBookingDto,
    now: Date = new Date(),
  ): Promise<BookingView> {
    const onBehalf = dto.customerId !== undefined;
    const customerId = await this.resolveCustomerId(user, dto.customerId);
    await this.assertNoUnpaidFine(customerId);
    const { type, price, dates, installments, schedule } = await this.plan(
      {
        startDate: dto.startDate,
        endDate: dto.endDate,
        startRound: dto.startRound,
        roundCount: dto.roundCount,
        skipDates: dto.skipDates,
        plan: dto.plan,
        slotCount: dto.slotIds.length,
      },
      now,
    );
    await this.assertSlotsBookable(dto.slotIds, onBehalf);
    // ยอดคำนวณที่ server เสมอ ค่าจาก client ใช้แค่ตรวจว่าตรงกับที่ผู้ใช้เห็น (ราคาอาจเปลี่ยนระหว่างดูหน้าทวน)
    const total = sumAmounts(installments);
    if (
      dto.expectedTotal !== undefined &&
      !sameMoney(total, dto.expectedTotal)
    ) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'PRICE_CHANGED',
        'The price changed after the quote; review the new total',
        [String(total)],
      );
    }

    const dailyAmount = dto.slotIds.length * dto.roundCount * price;
    const payNow = installments.find((item) => item.dueAt === null);
    const { qrTtlMinutes } = await this.settings.current();
    const expiresAt = new Date(now.getTime() + qrTtlMinutes * MS_PER_MINUTE);
    const dueByDate = new Map(
      installments.flatMap((item) =>
        item.coversDates.map((date) => [date, item.dueAt] as const),
      ),
    );

    let bookingId: number;
    try {
      bookingId = await this.prisma.$transaction(async (tx) => {
        const booking = await tx.booking.create({
          data: {
            bookingNo: tempBookingNo(),
            customerId,
            createdById: user.id,
            source: onBehalf ? 'CUSTOMER_SERVICE' : 'SELF',
            type,
            paymentPlan: dto.plan,
            startDate: toDbDate(dto.startDate),
            endDate: toDbDate(dto.endDate),
            startRound: dto.startRound,
            roundCount: dto.roundCount,
            pricePerSlotRound: price,
            totalAmount: total,
            slots: { create: dto.slotIds.map((slotId) => ({ slotId })) },
          },
        });
        await tx.booking.update({
          where: { id: booking.id },
          data: { bookingNo: bookingNoFor(booking.id, now) },
        });
        // unique (ช่อง, วัน, รอบ) ของตารางนี้คือตัวกันจองซ้อน — ชนแล้ว transaction ทั้งก้อนถูกยกเลิก
        await tx.slotOccupancy.createMany({
          data: expandRounds(dto, schedule).flatMap((key) =>
            dto.slotIds.map((slotId) => ({
              slotId,
              bookingId: booking.id,
              serviceDate: toDbDate(key.serviceDate),
              roundIndex: key.roundIndex,
            })),
          ),
        });
        const payment = await this.payments.createPending(
          tx,
          {
            purpose: 'BOOKING',
            bookingId: booking.id,
            amount: payNow?.amount ?? 0,
            expiresAt,
          },
          now,
        );
        await tx.bookingDay.createMany({
          data: dates.map((date) => ({
            bookingId: booking.id,
            serviceDate: toDbDate(date),
            amount: dailyAmount,
            // วันที่ชำระทันที: กำหนดชำระคือเวลาที่ QR หมดอายุ
            dueAt: dueByDate.get(date) ?? expiresAt,
            paymentId: payNow?.coversDates.includes(date) ? payment.id : null,
          })),
        });
        return booking.id;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'BOOKING_SLOT_TAKEN',
          'One or more slots were just booked by someone else',
        );
      }
      throw error;
    }

    if (onBehalf) {
      await this.audit.record({
        userId: user.id,
        action: 'BOOKING_ON_BEHALF',
        entity: 'booking',
        entityId: bookingId,
        detail: { customerId },
      });
    }
    return this.get(user, bookingId, now);
  }

  // ข้อ 2: จองเองต้องมีสิทธิ์จองด้วยตนเอง; จองแทนต้องเป็นฝ่ายบริการลูกค้าที่ได้รับสิทธิ์
  private async resolveCustomerId(
    user: AuthUser,
    customerId: number | undefined,
  ): Promise<number> {
    if (customerId === undefined) {
      if (!hasPermission(user, 'BOOKING_CREATE_SELF')) throw denied();
      return user.id;
    }
    if (!hasPermission(user, 'BOOKING_CREATE_ON_BEHALF')) throw denied();
    const customer = await this.prisma.user.findFirst({
      where: { id: customerId, type: { in: CUSTOMER_TYPES } },
    });
    // ปิดใช้งานแยกจากไม่พบ: ฝ่ายบริการลูกค้าต้องรู้ว่าต้องเปิดบัญชีก่อน ไม่ใช่ค้นใหม่
    if (customer && !customer.isActive) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CUSTOMER_INACTIVE',
        'This customer account is disabled',
      );
    }
    if (!customer) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'BOOKING_CUSTOMER_INVALID',
        'Customer not found or not registered',
      );
    }
    return customer.id;
  }

  // Workflow ข้อ 3.1 และ 6: มีค่าปรับค้างชำระ ไม่อนุญาตให้ใช้สิทธิ์จอดจนกว่าจะชำระ
  private async assertNoUnpaidFine(customerId: number): Promise<void> {
    const unpaid = await this.prisma.fine.count({
      where: { customerId, NOT: { payment: { status: 'PAID' } } },
    });
    if (unpaid > 0) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'BOOKING_UNPAID_FINE',
        'Customer has an unpaid fine and cannot book until it is paid',
      );
    }
  }

  private async assertSlotsBookable(
    slotIds: number[],
    onBehalf: boolean,
  ): Promise<void> {
    const slots = await this.prisma.parkingSlot.findMany({
      where: { id: { in: slotIds }, deletedAt: null, lot: { deletedAt: null } },
      include: { lot: { select: { isOpen: true } } },
    });
    const viewer = onBehalf ? 'CUSTOMER_SERVICE' : 'CUSTOMER';
    const allBookable =
      slots.length === slotIds.length &&
      slots.every((slot) =>
        isBookableBy(
          resolveStatus({
            baseStatus: slot.baseStatus,
            lotOpen: slot.lot.isOpen,
            // การจองซ้อนตรวจด้วย unique ของฐานข้อมูลตอนบันทึก
            occupied: false,
            overtime: false,
          }),
          viewer,
        ),
      );
    if (!allBookable) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'BOOKING_SLOT_NOT_BOOKABLE',
        'One or more slots are closed, reserved or do not exist',
      );
    }
  }

  // ผู้ขอใช้บริการเห็นเฉพาะการจองของตนเอง พนักงานเห็นทั้งหมดและค้นหาได้
  async list(
    user: AuthUser,
    query: ListBookingsQueryDto,
    now: Date = new Date(),
  ): Promise<BookingView[]> {
    const keyword = query.q?.trim();
    const isStaff = user.type === 'EMPLOYEE';
    const scope = query.scope ?? 'ALL';
    // ค้นจากเลขที่การจองหรือรหัสช่อง; พนักงานค้นจากชื่อ/เบอร์ลูกค้าได้ด้วย
    const search: Prisma.BookingWhereInput = keyword
      ? {
          OR: [
            { bookingNo: { contains: keyword, mode: 'insensitive' } },
            {
              slots: {
                some: {
                  slot: { code: { contains: keyword, mode: 'insensitive' } },
                },
              },
            },
            ...(isStaff
              ? [
                  {
                    customer: {
                      fullName: { contains: keyword, mode: 'insensitive' },
                    },
                  } satisfies Prisma.BookingWhereInput,
                  { customer: { phone: { contains: keyword } } },
                ]
              : []),
          ],
        }
      : {};
    const paged = scope === 'ALL';
    const bookings = await this.prisma.booking.findMany({
      where: {
        AND: [
          isStaff ? {} : { customerId: user.id },
          search,
          scopeWhere(scope, todayInBangkok(now)),
          paged && query.before ? { id: { lt: query.before } } : {},
        ],
      },
      include: BOOKING_INCLUDE,
      orderBy: { id: 'desc' },
      take: paged ? BOOKING_PAGE_SIZE : undefined,
    });
    const scheduleFor = await this.rounds.resolver();
    return bookings.map((booking) => toView(booking, now, scheduleFor));
  }

  async get(
    user: AuthUser,
    id: number,
    now: Date = new Date(),
  ): Promise<BookingView> {
    const booking = await this.findAccessible(user, id);
    return toView(booking, now, await this.rounds.resolver());
  }

  private async findAccessible(
    user: AuthUser,
    id: number,
  ): Promise<BookingRecord> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: BOOKING_INCLUDE,
    });
    // ไม่ใช่เจ้าของ = ตอบเหมือนไม่มีรายการ ไม่บอกว่ามีอยู่จริง
    if (!booking) throw notFound();
    if (user.type !== 'EMPLOYEE' && booking.customerId !== user.id) {
      throw notFound();
    }
    return booking;
  }

  // Screen Design "ตารางการจอง": การใช้ช่องจอดของผู้ขอใช้บริการตั้งแต่ตอนนี้เป็นต้นไป ไม่รวมที่ผ่านไปแล้ว
  async getSchedule(
    user: AuthUser,
    now: Date = new Date(),
  ): Promise<BookingSchedule> {
    const today = todayInBangkok(now);
    // รอบที่ข้ามเที่ยงคืนของวันบริการเมื่อวานอาจยังใช้อยู่
    const yesterday = addDays(today, -1);
    const lastShown = addDays(today, MAX_ADVANCE_DAYS);
    const bookings = await this.prisma.booking.findMany({
      where: {
        customerId: user.id,
        status: 'CONFIRMED',
        startDate: { lte: toDbDate(lastShown) },
        endDate: { gte: toDbDate(yesterday) },
      },
      include: {
        slots: { include: { slot: { select: { code: true } } } },
        days: { select: { serviceDate: true } },
      },
      orderBy: { startDate: 'asc' },
      take: LIST_LIMIT,
    });

    const scheduleFor = await this.rounds.resolver();
    const entries: ScheduleEntry[] = [];
    for (const booking of bookings) {
      const slotIds = booking.slots.map((item) => item.slotId);
      const schedule = scheduleFor(fromDbDate(booking.startDate));
      // เฉพาะวันที่จองจริง — การจองอาจข้ามบางวันในช่วง
      const dates = bookedDatesWithin(
        booking.days.map((day) => fromDbDate(day.serviceDate)),
        yesterday,
        lastShown,
      );
      for (const serviceDate of dates) {
        const window = usageWindow(
          serviceDate,
          booking.startRound,
          booking.roundCount,
          schedule,
        );
        if (window.endsAt <= now) continue;
        const active = window.startsAt <= now;
        const continues =
          active &&
          (await continuesInNextRound(this.prisma, {
            customerId: user.id,
            slotIds,
            serviceDate,
            startRound: booking.startRound,
            roundCount: booking.roundCount,
            schedule,
          }));
        const next = roundAfterUsage(
          serviceDate,
          booking.startRound,
          booking.roundCount,
          schedule,
        );
        entries.push({
          bookingId: booking.id,
          bookingNo: booking.bookingNo,
          serviceDate,
          slots: booking.slots.map((item) => item.slot.code).sort(),
          slotIds,
          startsAt: window.startsAt.toISOString(),
          endsAt: window.endsAt.toISOString(),
          active,
          extend:
            active && !continues
              ? { date: next.serviceDate, startRound: next.roundIndex }
              : null,
        });
      }
    }
    entries.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return {
      now: now.toISOString(),
      warnMinutes: (await this.settings.current()).notifyBeforeMinutes,
      entries,
    };
  }

  // สร้างรายการชำระของวันที่ยังไม่จ่ายในการจองแบบวันต่อวัน
  async payDays(
    user: AuthUser,
    id: number,
    dto: PayDaysDto,
    now: Date = new Date(),
  ): Promise<BookingView> {
    // ตรวจสิทธิ์เข้าถึงการจองนี้ก่อน (ไม่ใช่ของตัวเอง = ไม่พบ)
    await this.findAccessible(user, id);
    const wanted = new Set(dto.dates);
    const { qrTtlMinutes } = await this.settings.current();
    await this.prisma.$transaction(async (tx) => {
      // ล็อกการจองนี้ไว้จนจบ transaction: กดชำระพร้อมกันหลายครั้ง (กดรัว / สองแท็บ / เน็ตช้าแล้วกดซ้ำ)
      // เข้ามาทีละคำขอ คำขอหลังเห็น QR ที่คำขอแรกเพิ่งออกแล้วใช้ QR นั้น — ไม่เกิด QR หลายอันของวันเดียวกันที่จ่ายได้ทุกอัน
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id} FOR UPDATE`;
      const current = await tx.booking.findUniqueOrThrow({
        where: { id },
        select: {
          status: true,
          days: true,
          payments: { where: { status: 'PENDING' } },
        },
      });
      const days = current.days.filter(
        (day) => day.paidAt === null && wanted.has(fromDbDate(day.serviceDate)),
      );
      if (current.status !== 'CONFIRMED' || days.length !== wanted.size) {
        throw new ApiException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'BOOKING_DAYS_NOT_PAYABLE',
          'These days cannot be paid: already paid, or the booking is not active',
        );
      }

      // กดชำระวันเดิมซ้ำขณะ QR เดิมยังไม่หมดอายุ: ใช้ QR เดิม ไม่ออกใหม่ทุกครั้งที่กด
      const reusable = current.payments.find(
        (payment) =>
          payment.expiresAt > now &&
          sameDates(
            current.days
              .filter((day) => day.paymentId === payment.id)
              .map((day) => fromDbDate(day.serviceDate)),
            dto.dates,
          ),
      );
      if (reusable) return;

      // QR เดิมที่ค้างอยู่ใช้ไม่ได้อีก เพื่อไม่ให้วันเดียวกันถูกชำระสองครั้ง
      const staleIds = current.payments.map((payment) => payment.id);
      await tx.bookingDay.updateMany({
        where: { paymentId: { in: staleIds }, paidAt: null },
        data: { paymentId: null },
      });
      await tx.payment.updateMany({
        where: { id: { in: staleIds } },
        data: { status: 'EXPIRED' },
      });

      const payment = await this.payments.createPending(
        tx,
        {
          purpose: 'BOOKING',
          bookingId: id,
          amount: days.reduce((total, day) => total + Number(day.amount), 0),
          expiresAt: new Date(now.getTime() + qrTtlMinutes * MS_PER_MINUTE),
        },
        now,
      );
      await tx.bookingDay.updateMany({
        where: { id: { in: days.map((day) => day.id) } },
        data: { paymentId: payment.id },
      });
    });
    return this.get(user, id, now);
  }

  // ฝ่ายบริการลูกค้าค้นหาผู้ขอใช้บริการเพื่อจองแทน
  async searchCustomers(search?: string): Promise<CustomerView[]> {
    const keyword = search?.trim();
    const customers = await this.prisma.user.findMany({
      where: {
        type: { in: CUSTOMER_TYPES },
        isActive: true,
        ...(keyword
          ? {
              OR: [
                { fullName: { contains: keyword, mode: 'insensitive' } },
                { phone: { contains: keyword } },
              ],
            }
          : {}),
      },
      orderBy: { fullName: 'asc' },
      take: CUSTOMER_SEARCH_LIMIT,
    });
    return customers.map((customer) => ({
      id: customer.id,
      name: customer.fullName,
      phone: customer.phone,
      userType: customer.type,
    }));
  }
}
