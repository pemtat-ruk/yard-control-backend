import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ApiException } from '../../common/api-exception.js';
import { nextDocumentNo } from '../../common/document-no.js';
import {
  addDays,
  toDbDate,
  todayInBangkok,
} from '../../common/service-date.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { customerName, userTypeOf } from '../auth/domain/customer.js';
import { hasPermission, type UserType } from '../auth/domain/permissions.js';
import { LayoutService, type Catalog } from '../layout/layout.service.js';
import { toDueColumns } from '../payment/domain/due.js';
import {
  buildPaymentSchedule,
  type Installment,
  type PaymentPlan,
} from '../payment/domain/schedule.js';
import { PaymentService } from '../payment/payment.service.js';
import {
  RoundsService,
  type ScheduleResolver,
} from '../rounds/rounds.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { parseSlotLabel, sortedLabels } from '../yard/domain/slot-label.js';
import { isBookableBy, resolveStatus } from '../yard/domain/slot-status.js';
import {
  loadActiveSlots,
  loadBookingUsages,
  loadOccupancies,
  type SlotRow,
} from '../yard/yard-store.js';
import { continuesInNextRound } from './booking-continuation.js';
import {
  BOOKING_INCLUDE,
  scheduleDate,
  toBookingView,
  type BookingRecord,
  type BookingView,
} from './booking-record.js';
import {
  BOOKING_ACTIVE,
  BOOKING_TYPE_CODE,
  bookingNoOfTicket,
  CONFIRMED_BOOKING,
  isConfirmed,
  PAY_PAID,
  PAY_WAITING,
  PAYMENT_TYPE_CODE,
} from './domain/booking-status.js';
import {
  classifyBooking,
  expandRounds,
  firstOpenRound,
  listRounds,
  MAX_ADVANCE_DAYS,
  roundAfterUsage,
  roundsPerDay,
  serviceDates,
  usageWindow,
  validateBookingRequest,
  type BookingRequest,
  type BookingType,
  type RoundSchedule,
} from './domain/rounds.js';
import type {
  BookingScope,
  CreateBookingDto,
  ListBookingsQueryDto,
  PayDaysDto,
} from './dto/create-booking.dto.js';
import type { QuoteBookingDto } from './dto/quote-booking.dto.js';

export type { BookingView } from './booking-record.js';

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

// การใช้ช่องจอดหนึ่งวันบริการของผู้ขอใช้บริการ ที่กำลังใช้อยู่หรือยังมาไม่ถึง
export type ScheduleEntry = {
  bookingId: string;
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
  id: string; // CusId
  name: string;
  phone: string | null;
  userType: UserType;
};

const MS_PER_MINUTE = 60 * 1000;
// รายการจองทีละหน้า (โหลดต่อด้วย before)
export const BOOKING_PAGE_SIZE = 50;
const CUSTOMER_SEARCH_LIMIT = 20;

// คำค้นช่องจอด: รหัสเต็ม "P5-12" ค้นในลาน P5 เท่านั้น; คำค้นอื่นค้นรหัสช่องของทุกลาน
// ไม่สนตัวพิมพ์เล็ก/ใหญ่ตาม collation ของฐานข้อมูล (Thai_CI_AS)
function slotKeywordFilter(keyword: string): Prisma.ParkingSlotWhereInput {
  const parsed = parseSlotLabel(keyword);
  const slot = { contains: parsed?.code ?? keyword };
  return parsed
    ? { slot, parking: { extra: { code: { equals: parsed.lot } } } }
    : { slot };
}

function scopeWhere(
  scope: BookingScope,
  today: string,
): Prisma.BookingHeaderWhereInput {
  if (scope === 'PENDING') {
    return {
      bookingStatus: BOOKING_ACTIVE,
      OR: [
        { paymentStatus: PAY_WAITING },
        { schedules: { some: { paymentStatus: PAY_WAITING } } },
      ],
    };
  }
  if (scope === 'ACTIVE') {
    return {
      bookingStatus: BOOKING_ACTIVE,
      details: { some: { usageDate: { gte: toDbDate(today) } } },
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

function slotTaken(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    'BOOKING_SLOT_TAKEN',
    'One or more slots were just booked by someone else',
  );
}

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly rounds: RoundsService,
    private readonly layout: LayoutService,
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
    catalog: Catalog;
  }> {
    const catalog = await this.layout.catalog();
    const scheduleFor: ScheduleResolver = (date) => catalog.scheduleFor(date);
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
    const price = catalog.priceFor(request.startDate);
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
      catalog,
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
    const { type, price, dates, installments, schedule, catalog } =
      await this.plan(
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
    const slots = await this.assertSlotsBookable(dto.slotIds, onBehalf);
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
    const keys = expandRounds(dto, schedule);
    const rows = keys.flatMap((key) =>
      slots.map((slot) => {
        const roundId = catalog.roundIdOf(key.serviceDate, key.roundIndex);
        if (roundId === null) {
          throw new ApiException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'BOOKING_SLOT_NOT_BOOKABLE',
            'One or more slots have no layout or rounds on these dates',
          );
        }
        return { key, slotId: BigInt(slot.id), roundId };
      }),
    );

    const bookingNo = await this.prisma.$transaction(async (tx) => {
      // ล็อกแถวช่องที่จองไว้จนจบ transaction (เรียงตามรหัส กัน deadlock) — คำขอที่จองช่องเดียวกันต้องรอคิว
      // แล้วจึงตรวจซ้อน: การจองที่ยกเลิกยังเก็บ BookingDetail ไว้ จึงใช้ unique ของฐานข้อมูลไม่ได้
      for (const slotId of [...dto.slotIds].sort((a, b) => a - b)) {
        await tx.$queryRaw`SELECT ParkingSlotID FROM ParkingSlot WITH (UPDLOCK, ROWLOCK) WHERE ParkingSlotID = ${slotId}`;
      }
      const sorted = keys.map((key) => key.serviceDate).sort();
      const wanted = new Set(
        keys.map((key) => `${key.serviceDate}:${key.roundIndex}`),
      );
      const taken = await loadOccupancies(
        tx,
        { from: sorted[0], to: sorted[sorted.length - 1] },
        { slotIds: dto.slotIds },
      );
      if (
        taken.some((row) => wanted.has(`${row.serviceDate}:${row.roundIndex}`))
      ) {
        throw slotTaken();
      }

      const bookingNo = await nextDocumentNo(tx, 'BK', user.id, now);
      await tx.bookingHeader.create({
        data: {
          bookingNo,
          bookingDate: now,
          bookingCusId: customerId,
          bookingChannel: 'N',
          bookingType: BOOKING_TYPE_CODE[type],
          paymentType: PAYMENT_TYPE_CODE[dto.plan],
          paymentStatus: PAY_WAITING,
          bookingStatus: BOOKING_ACTIVE,
          totalAmount: total,
          createdBy: user.id,
          createdDate: now,
        },
      });
      await tx.bookingDetail.createMany({
        data: rows.map((row) => ({
          bookingNo,
          usageDate: toDbDate(row.key.serviceDate),
          parkingSlotId: row.slotId,
          roundId: row.roundId,
          amount: price,
        })),
      });
      const payment = await this.payments.createPending(
        tx,
        {
          purpose: 'BOOKING',
          bookingNo,
          amount: payNow?.amount ?? 0,
          expiresAt,
        },
        now,
      );
      await this.createSchedules(tx, {
        bookingNo,
        dates,
        dailyAmount,
        dueAt: (date) => dueByDate.get(date) ?? expiresAt,
        payNowDates: payNow?.coversDates ?? [],
        paymentId: payment.id,
        actor: user.id,
      });
      return bookingNo;
    });

    if (onBehalf) {
      await this.audit.record({
        actor: user.id,
        action: 'BOOKING_ON_BEHALF',
        entity: 'booking',
        entityId: bookingNo,
        detail: { customerId },
      });
    }
    return this.get(user, bookingNo, now);
  }

  // PaymentSchedule: 1 งวดต่อ 1 วันบริการ อ้าง BookingDetail แถวแรกของวันนั้น
  // วันที่ชำระทันที: กำหนดชำระคือเวลาที่ QR หมดอายุ และผูกกับ QR แรก
  async createSchedules(
    tx: Prisma.TransactionClient,
    input: {
      bookingNo: string;
      dates: string[];
      dailyAmount: number;
      dueAt: (date: string) => Date;
      payNowDates: string[];
      paymentId: number | null;
      actor: string;
      paid?: Date;
    },
  ): Promise<void> {
    const firstRows = await tx.bookingDetail.groupBy({
      by: ['usageDate'],
      where: { bookingNo: input.bookingNo },
      _min: { bookingDetailId: true },
    });
    const detailOf = new Map(
      firstRows.map((row) => [
        row.usageDate.toISOString().slice(0, 10),
        row._min.bookingDetailId,
      ]),
    );
    for (const [index, date] of input.dates.entries()) {
      const schedule = await tx.paymentSchedule.create({
        data: {
          bookingNo: input.bookingNo,
          bookingDetailId: detailOf.get(date) ?? null,
          sequenceNo: index + 1,
          ...toDueColumns(input.dueAt(date)),
          amountDue: input.dailyAmount,
          paymentStatus: input.paid ? PAY_PAID : PAY_WAITING,
          paidAt: input.paid ?? null,
          createdBy: input.actor,
        },
      });
      if (input.paymentId !== null && input.payNowDates.includes(date)) {
        await tx.paymentScheduleItem.create({
          data: {
            paymentId: input.paymentId,
            payScheduleId: schedule.payScheduleId,
          },
        });
      }
    }
  }

  // ข้อ 2: จองเองต้องมีสิทธิ์จองด้วยตนเอง; จองแทนต้องเป็นฝ่ายบริการลูกค้าที่ได้รับสิทธิ์
  private async resolveCustomerId(
    user: AuthUser,
    customerId: string | undefined,
  ): Promise<string> {
    if (customerId === undefined) {
      if (!hasPermission(user, 'BOOKING_CREATE_SELF')) throw denied();
      return user.id;
    }
    if (!hasPermission(user, 'BOOKING_CREATE_ON_BEHALF')) throw denied();
    const customer = await this.prisma.cRMCustomer.findUnique({
      where: { cusId: customerId },
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
    return customer.cusId;
  }

  // Workflow ข้อ 3.1 และ 6: มีค่าปรับค้างชำระ ไม่อนุญาตให้ใช้สิทธิ์จอดจนกว่าจะชำระ
  private async assertNoUnpaidFine(customerId: string): Promise<void> {
    const unpaid = await this.prisma.fine.count({
      where: { cusId: customerId, NOT: { payment: { status: 'PAID' } } },
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
  ): Promise<SlotRow[]> {
    const slots = await loadActiveSlots(this.prisma, {
      parkingSlotId: { in: slotIds },
    });
    const viewer = onBehalf ? 'CUSTOMER_SERVICE' : 'CUSTOMER';
    const allBookable =
      slots.length === slotIds.length &&
      slots.every((slot) =>
        isBookableBy(
          resolveStatus({
            baseStatus: slot.baseStatus,
            lotOpen: slot.lot.isOpen,
            // การจองซ้อนตรวจตอนบันทึก หลังล็อกแถวช่อง
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
    return slots;
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
    const ticketBookingNo = keyword ? bookingNoOfTicket(keyword) : null;
    // ค้นจากเลขที่การจอง เลขที่ตั๋ว (พิมพ์หรือยิงบาร์โค้ดที่ป้อม) หรือรหัสช่อง; พนักงานค้นจากชื่อ/เบอร์ลูกค้าได้ด้วย
    const search: Prisma.BookingHeaderWhereInput = keyword
      ? {
          OR: [
            { bookingNo: { contains: keyword } },
            ...(ticketBookingNo ? [{ bookingNo: ticketBookingNo }] : []),
            {
              details: {
                some: { slot: slotKeywordFilter(keyword) },
              },
            },
            ...(isStaff
              ? [
                  { customer: { firstName: { contains: keyword } } },
                  { customer: { lastName: { contains: keyword } } },
                  { customer: { telephone: { contains: keyword } } },
                ]
              : []),
          ],
        }
      : {};
    const today = todayInBangkok(now);
    const paged = scope === 'ALL';
    const bookings = await this.prisma.bookingHeader.findMany({
      where: {
        AND: [
          isStaff ? {} : { bookingCusId: user.id },
          search,
          scopeWhere(scope, today),
          paged && query.before ? { bookingNo: { lt: query.before } } : {},
        ],
      },
      include: BOOKING_INCLUDE,
      orderBy: { bookingNo: 'desc' },
      take: paged ? BOOKING_PAGE_SIZE : undefined,
    });
    const scheduleFor = await this.rounds.resolver();
    return bookings.map((booking) =>
      toBookingView(booking, now, today, scheduleFor),
    );
  }

  async get(
    user: AuthUser,
    bookingNo: string,
    now: Date = new Date(),
  ): Promise<BookingView> {
    const booking = await this.findAccessible(user, bookingNo);
    return toBookingView(
      booking,
      now,
      todayInBangkok(now),
      await this.rounds.resolver(),
    );
  }

  private async findAccessible(
    user: AuthUser,
    bookingNo: string,
  ): Promise<BookingRecord> {
    const booking = await this.prisma.bookingHeader.findUnique({
      where: { bookingNo },
      include: BOOKING_INCLUDE,
    });
    // ไม่ใช่เจ้าของ = ตอบเหมือนไม่มีรายการ ไม่บอกว่ามีอยู่จริง
    if (!booking) throw notFound();
    if (user.type !== 'EMPLOYEE' && booking.bookingCusId !== user.id) {
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
    const scheduleFor = await this.rounds.resolver();
    const [usages, slots] = await Promise.all([
      loadBookingUsages(
        this.prisma,
        { from: yesterday, to: lastShown },
        (date) => roundsPerDay(scheduleFor(date)),
        { bookingCusId: user.id, ...CONFIRMED_BOOKING },
      ),
      loadActiveSlots(this.prisma),
    ]);
    const slotById = new Map(slots.map((slot) => [slot.id, slot]));

    const entries: ScheduleEntry[] = [];
    for (const usage of usages) {
      const labels = sortedLabels(
        usage.slotIds.flatMap((id) => {
          const slot = slotById.get(id);
          return slot ? [slot] : [];
        }),
      );
      for (const serviceDate of usage.dates) {
        const schedule = scheduleFor(serviceDate);
        const window = usageWindow(
          serviceDate,
          usage.startRound,
          usage.roundCount,
          schedule,
        );
        if (window.endsAt <= now) continue;
        const active = window.startsAt <= now;
        const continues =
          active &&
          (await continuesInNextRound(this.prisma, {
            customerId: user.id,
            slotIds: usage.slotIds,
            serviceDate,
            startRound: usage.startRound,
            roundCount: usage.roundCount,
            schedule,
          }));
        const next = roundAfterUsage(
          serviceDate,
          usage.startRound,
          usage.roundCount,
          schedule,
        );
        entries.push({
          bookingId: usage.bookingNo,
          bookingNo: usage.bookingNo,
          serviceDate,
          slots: labels,
          slotIds: usage.slotIds,
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
    bookingNo: string,
    dto: PayDaysDto,
    now: Date = new Date(),
  ): Promise<BookingView> {
    // ตรวจสิทธิ์เข้าถึงการจองนี้ก่อน (ไม่ใช่ของตัวเอง = ไม่พบ)
    await this.findAccessible(user, bookingNo);
    const wanted = new Set(dto.dates);
    const { qrTtlMinutes } = await this.settings.current();
    await this.prisma.$transaction(async (tx) => {
      // ล็อกใบจองนี้ไว้จนจบ transaction: กดชำระพร้อมกันหลายครั้ง (กดรัว / สองแท็บ / เน็ตช้าแล้วกดซ้ำ)
      // เข้ามาทีละคำขอ คำขอหลังเห็น QR ที่คำขอแรกเพิ่งออกแล้วใช้ QR นั้น — ไม่เกิด QR หลายอันของวันเดียวกันที่จ่ายได้ทุกอัน
      await tx.$queryRaw`SELECT BookingNo FROM BookingHeader WITH (UPDLOCK, ROWLOCK) WHERE BookingNo = ${bookingNo}`;
      const current = await tx.bookingHeader.findUniqueOrThrow({
        where: { bookingNo },
        select: {
          bookingStatus: true,
          paymentStatus: true,
          bookingChannel: true,
          schedules: {
            include: {
              detail: { select: { usageDate: true } },
              transactions: { select: { paymentId: true } },
            },
          },
          transactions: { where: { status: 'PENDING' } },
        },
      });
      const schedules = current.schedules.filter(
        (schedule) =>
          schedule.paymentStatus === PAY_WAITING &&
          wanted.has(scheduleDate(schedule)),
      );
      if (!isConfirmed(current) || schedules.length !== wanted.size) {
        throw new ApiException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'BOOKING_DAYS_NOT_PAYABLE',
          'These days cannot be paid: already paid, or the booking is not active',
        );
      }

      // กดชำระวันเดิมซ้ำขณะ QR เดิมยังไม่หมดอายุ: ใช้ QR เดิม ไม่ออกใหม่ทุกครั้งที่กด
      const reusable = current.transactions.find(
        (payment) =>
          payment.expiresAt > now &&
          sameDates(
            current.schedules
              .filter((schedule) =>
                schedule.transactions.some(
                  (item) => item.paymentId === payment.id,
                ),
              )
              .map(scheduleDate),
            dto.dates,
          ),
      );
      if (reusable) return;

      // QR เดิมที่ค้างอยู่ใช้ไม่ได้อีก เพื่อไม่ให้วันเดียวกันถูกชำระสองครั้ง
      const staleIds = current.transactions.map((payment) => payment.id);
      await tx.paymentScheduleItem.deleteMany({
        where: {
          paymentId: { in: staleIds },
          schedule: { paymentStatus: PAY_WAITING },
        },
      });
      await tx.paymentTransaction.updateMany({
        where: { id: { in: staleIds } },
        data: { status: 'EXPIRED' },
      });

      const payment = await this.payments.createPending(
        tx,
        {
          purpose: 'BOOKING',
          bookingNo,
          amount: schedules.reduce(
            (total, schedule) => total + Number(schedule.amountDue),
            0,
          ),
          expiresAt: new Date(now.getTime() + qrTtlMinutes * MS_PER_MINUTE),
        },
        now,
      );
      await tx.paymentScheduleItem.createMany({
        data: schedules.map((schedule) => ({
          paymentId: payment.id,
          payScheduleId: schedule.payScheduleId,
        })),
      });
    });
    return this.get(user, bookingNo, now);
  }

  // ฝ่ายบริการลูกค้าค้นหาผู้ขอใช้บริการเพื่อจองแทน
  async searchCustomers(search?: string): Promise<CustomerView[]> {
    const keyword = search?.trim();
    const customers = await this.prisma.cRMCustomer.findMany({
      where: {
        isActive: true,
        ...(keyword
          ? {
              OR: [
                { firstName: { contains: keyword } },
                { lastName: { contains: keyword } },
                { telephone: { contains: keyword } },
                { cusId: { contains: keyword } },
              ],
            }
          : {}),
      },
      orderBy: { firstName: 'asc' },
      take: CUSTOMER_SEARCH_LIMIT,
    });
    return customers.map((customer) => ({
      id: customer.cusId,
      name: customerName(customer),
      phone: customer.telephone,
      userType: userTypeOf(customer.cusType),
    }));
  }
}
