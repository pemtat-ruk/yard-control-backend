import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ApiException } from '../../common/api-exception.js';
import { nextDocumentNo } from '../../common/document-no.js';
import { fromDbDate } from '../../common/service-date.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { dbSlotLabel, SLOT_WITH_LOT } from '../yard/domain/slot-label.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { customerName, userTypeOf } from '../auth/domain/customer.js';
import type { UserType } from '../auth/domain/permissions.js';
import { PaymentService } from '../payment/payment.service.js';
import { RoundsService } from '../rounds/rounds.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { EventsService } from '../events/events.service.js';
import { BOOKING_INCLUDE, shapeOf } from '../booking/booking-record.js';
import { usageWindow } from '../booking/domain/rounds.js';
import {
  overtimeFine,
  overtimeMinutesAt,
  slotsFine,
  type SlotsFine,
} from './domain/fine-amount.js';
import type {
  CreateFineDto,
  FineTargetDto,
  ListFinesQueryDto,
} from './dto/create-fine.dto.js';
import { storedVat, type VatBreakdown } from '../payment/domain/vat.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// ค่าปรับทีละหน้า (โหลดต่อด้วย before)
const LIST_LIMIT = 50;

const FINE_INCLUDE = {
  detail: { select: { slot: { select: SLOT_WITH_LOT } } },
  payment: {
    select: { status: true, transactionNo: true, receipt: true },
  },
} satisfies Prisma.FineInclude;
type FineRecord = Prisma.FineGetPayload<{ include: typeof FINE_INCLUDE }>;

type CustomerInfo = { name: string; type: UserType };

const MINUTES_PER_HOUR = 60;

// เหตุผลที่บันทึกในค่าปรับ (ลูกค้าเห็นในรายการค่าปรับ)
function overtimeReason(fine: SlotsFine, note?: string): string {
  const hours = Math.floor(fine.overtimeMinutes / MINUTES_PER_HOUR);
  const minutes = fine.overtimeMinutes % MINUTES_PER_HOUR;
  // ไม่แสดงส่วนที่เป็นศูนย์ ("0 ชม. 0 นาที")
  const parts = [
    hours > 0 ? `${hours} ชม.` : '',
    minutes > 0 ? `${minutes} นาที` : '',
  ].filter(Boolean);
  const duration = parts.length > 0 ? parts.join(' ') : 'ไม่ถึง 1 นาที';
  const slots = fine.slots > 1 ? ` × ${fine.slots} ช่อง` : '';
  const reason = `จอดเกินเวลา ${duration} (${fine.rounds} รอบ × ${fine.pricePerSlotRound} บาท × ${fine.multiplier}${slots})`;
  return note?.trim() ? `${reason} — ${note.trim()}` : reason;
}

export type FineView = {
  id: number;
  fineNo: string;
  customerName: string | null;
  // ช่องที่ถูกปรับ — 1 ใบต่อ 1 ช่อง (คงเป็นรายการไว้ ให้หน้าเว็บใช้แบบเดิม)
  slotCodes: string[];
  bookingNo: string | null;
  reason: string;
  amount: number;
  createdAt: string;
  paymentId: number | null;
  paid: boolean;
  // ใบเสร็จค่าปรับ (Screen Design 6.12): มีเมื่อชำระแล้ว
  receipt: {
    receiptNo: string;
    issuedAt: string;
    transactionNo: string;
    vat: VatBreakdown;
  } | null;
  // ส่งเท่าที่ใบเสร็จใช้ ไม่ส่งเบอร์โทร/บัตรแรงงาน (PDPA: เก็บและเปิดเผยเท่าที่จำเป็น)
  customerType: UserType | null;
};

function toFineView(
  fine: FineRecord,
  customers: Map<string, CustomerInfo>,
): FineView {
  const customer = fine.cusId ? customers.get(fine.cusId) : undefined;
  return {
    id: fine.id,
    fineNo: fine.fineNo,
    customerName: customer?.name ?? null,
    slotCodes: [dbSlotLabel(fine.detail.slot)],
    bookingNo: fine.bookingNo,
    reason: fine.reason,
    amount: Number(fine.amount),
    createdAt: fine.createdDate.toISOString(),
    paymentId: fine.paymentId,
    paid: fine.payment?.status === 'PAID',
    receipt: fine.payment?.receipt
      ? {
          receiptNo: fine.payment.receipt.receiptNo,
          issuedAt: fine.payment.receipt.issuedAt.toISOString(),
          transactionNo: fine.payment.transactionNo,
          vat: storedVat(fine.payment.receipt),
        }
      : null,
    customerType: customer?.type ?? null,
  };
}

function notFound(): ApiException {
  return new ApiException(
    HttpStatus.NOT_FOUND,
    'RECORD_NOT_FOUND',
    'Fine not found',
  );
}

// ค่าปรับ (Fine ตาม Data Dictionary) — 1 ใบต่อ 1 ช่อง ผูกกับรายการจองของรอบที่จบก่อนจอดเกิน
@Injectable()
export class FineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly rounds: RoundsService,
    private readonly events: EventsService,
  ) {}

  private async customersOf(
    fines: { cusId: string | null }[],
  ): Promise<Map<string, CustomerInfo>> {
    const codes = [
      ...new Set(fines.flatMap((fine) => (fine.cusId ? [fine.cusId] : []))),
    ];
    const rows = await this.prisma.cRMCustomer.findMany({
      where: { cusId: { in: codes } },
      select: { cusId: true, firstName: true, lastName: true, cusType: true },
    });
    return new Map(
      rows.map((row) => [
        row.cusId,
        { name: customerName(row), type: userTypeOf(row.cusType) },
      ]),
    );
  }

  // ยอดค่าปรับ ณ ตอนนี้ ให้ผู้ตรวจสอบเห็นก่อนยืนยัน (คำนวณซ้ำตอนบันทึกจริง)
  async quote(dto: FineTargetDto, now: Date = new Date()): Promise<SlotsFine> {
    return (await this.calculate(dto, now)).fine;
  }

  private async calculate(dto: FineTargetDto, now: Date) {
    const booking = await this.prisma.bookingHeader.findUnique({
      where: { bookingNo: dto.bookingId },
      include: BOOKING_INCLUDE,
    });
    const slotDetails = (booking?.details ?? []).filter(
      (detail) => Number(detail.parkingSlotId) === dto.slotId,
    );
    if (!booking || slotDetails.length === 0) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'FINE_BOOKING_INVALID',
        'Booking not found, or it does not use this slot',
      );
    }
    const scheduleFor = await this.rounds.resolver();
    const shape = shapeOf(booking, scheduleFor);
    const schedule = scheduleFor(shape.dates[0]);
    const windows = shape.dates.map((date) =>
      usageWindow(date, shape.startRound, shape.roundCount, scheduleFor(date)),
    );
    const minutes = overtimeMinutesAt(windows, now);
    if (minutes === null) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'FINE_NOT_OVERTIME',
        'This slot is not past its booked time',
      );
    }
    // ช่วงใช้งานที่จบล่าสุดก่อนตอนนี้ (ช่วงที่ทำให้จอดเกิน) → รายการจองของช่องนี้ในรอบสุดท้ายของวันนั้น
    const endedIndex = windows.reduce(
      (best, window, index) =>
        window.endsAt <= now &&
        (best < 0 || window.endsAt > windows[best].endsAt)
          ? index
          : best,
      -1,
    );
    const endedDate = shape.dates[endedIndex];
    const detail = slotDetails
      .filter((item) => fromDbDate(item.usageDate) === endedDate)
      .sort((a, b) => b.round.roundSequence - a.round.roundSequence)[0];
    if (!detail) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'FINE_BOOKING_INVALID',
        'This slot was not booked on the day that ended',
      );
    }
    const { fineMultiplier } = await this.settings.current();
    // ราคาต่อช่องต่อรอบ ณ วันที่จอง (BookingDetail.Amount)
    const price = await this.prisma.bookingDetail.findFirst({
      where: { bookingNo: booking.bookingNo },
      select: { amount: true },
    });
    return {
      booking,
      detail,
      endsAt: windows[endedIndex].endsAt,
      fine: slotsFine(
        overtimeFine({
          overtimeMinutes: minutes,
          pricePerSlotRound: Number(price?.amount ?? 0),
          multiplier: fineMultiplier,
          roundHours: schedule.roundHours,
        }),
        1,
      ),
    };
  }

  async create(
    user: AuthUser,
    dto: CreateFineDto,
    now: Date = new Date(),
  ): Promise<{ fineId: number; paymentId: number; amount: number }> {
    const { finePaymentDays } = await this.settings.current();
    const {
      booking,
      detail,
      endsAt,
      fine: calculated,
    } = await this.calculate(dto, now);

    const { fineId, paymentId } = await this.prisma.$transaction(async (tx) => {
      // ล็อกใบจองนี้: ผู้ตรวจสองคนกดบันทึกค่าปรับพร้อมกันจะเข้าทีละคำขอ คำขอหลังเห็นค่าปรับของคำขอแรก
      await tx.$queryRaw`SELECT BookingNo FROM BookingHeader WITH (UPDLOCK, ROWLOCK) WHERE BookingNo = ${booking.bookingNo}`;
      // รายการจองหนึ่งแถว (ช่อง × วัน × รอบ) ถูกปรับได้ครั้งเดียว — การจองหลายวันที่เกินอีกวันเป็นอีกแถว ปรับใหม่ได้
      const fined = await tx.fine.findFirst({
        where: { bookingDetailId: detail.bookingDetailId },
        select: { detail: { select: { slot: { select: SLOT_WITH_LOT } } } },
      });
      if (fined) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'FINE_ALREADY_ISSUED',
          'This slot was already fined for this overtime',
          [dbSlotLabel(fined.detail.slot)],
        );
      }
      const payment = await this.payments.createPending(
        tx,
        {
          purpose: 'FINE',
          amount: calculated.total,
          expiresAt: new Date(now.getTime() + finePaymentDays * MS_PER_DAY),
        },
        now,
      );
      const fine = await tx.fine.create({
        data: {
          // รูปแบบตาม Data Dictionary: F ปี ค.ศ.-เดือน-เลขรัน (F2026-11-0001) รันใหม่ทุกเดือน
          fineNo: await nextDocumentNo(tx, 'F', user.id, now),
          cusId: booking.bookingCusId,
          bookingNo: booking.bookingNo,
          bookingDetailId: detail.bookingDetailId,
          endDateTime: endsAt,
          overtimeMinute: Math.floor(calculated.overtimeMinutes),
          issuedBy: user.id,
          reason: overtimeReason(calculated, dto.note),
          amount: calculated.total,
          paymentId: payment.id,
        },
      });
      // แจ้งลูกค้าในเว็บ: ค่าปรับค้างชำระทำให้จองใหม่ไม่ได้ ลูกค้าต้องรู้แม้ไม่ได้อยู่หน้างาน
      const slot = await tx.parkingSlot.findUniqueOrThrow({
        where: { parkingSlotId: detail.parkingSlotId },
        select: SLOT_WITH_LOT,
      });
      await tx.notificationLog.create({
        data: {
          recipientType: 'CUSTOMER',
          recipientCode: booking.bookingCusId,
          type: 'FINE_ISSUED',
          title: 'FINE_ISSUED',
          body: `${fine.fineNo} · ${dbSlotLabel(slot)} · ${calculated.total.toLocaleString('th-TH')} บาท`,
          dedupeKey: `fine:${fine.id}`,
        },
      });
      return { fineId: fine.id, paymentId: payment.id };
    });
    this.events.notificationsCreated([booking.bookingCusId]);
    await this.audit.record({
      actor: user.id,
      action: 'FINE_CREATE',
      entity: 'fine',
      entityId: fineId,
      detail: {
        bookingNo: dto.bookingId,
        slotId: dto.slotId,
        amount: calculated.total,
        rounds: calculated.rounds,
      },
    });
    // หน้าตรวจสอบเปิด QR ให้ลูกค้าที่อยู่หน้างานสแกนได้ทันที
    return { fineId, paymentId, amount: calculated.total };
  }

  // ค่าปรับค้างชำระปิดสิทธิ์จอง จึงต้องจ่ายได้เสมอ: QR เดิมหมดอายุแล้วให้ออกรายการชำระใหม่
  // คืน id ของรายการชำระที่ใช้ได้ตอนนี้
  async renewPayment(
    user: AuthUser,
    id: number,
    now: Date = new Date(),
  ): Promise<{ paymentId: number }> {
    const fine = await this.prisma.fine.findUnique({
      where: { id },
      include: { payment: true },
    });
    // ไม่ใช่เจ้าของ = ตอบเหมือนไม่มีรายการ ไม่บอกว่ามีอยู่จริง
    if (!fine || (user.type !== 'EMPLOYEE' && fine.cusId !== user.id)) {
      throw notFound();
    }
    if (fine.payment?.status === 'PAID') {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'FINE_ALREADY_PAID',
        'This fine has already been paid',
      );
    }
    const { finePaymentDays } = await this.settings.current();
    if (fine.payment?.status === 'PENDING' && fine.payment.expiresAt > now) {
      return { paymentId: fine.payment.id };
    }

    return this.prisma.$transaction(async (tx) => {
      if (fine.paymentId !== null) {
        await tx.paymentTransaction.updateMany({
          where: { id: fine.paymentId, status: 'PENDING' },
          data: { status: 'EXPIRED' },
        });
      }
      const payment = await this.payments.createPending(
        tx,
        {
          purpose: 'FINE',
          amount: Number(fine.amount),
          expiresAt: new Date(now.getTime() + finePaymentDays * MS_PER_DAY),
        },
        now,
      );
      await tx.fine.update({
        where: { id },
        data: { paymentId: payment.id },
      });
      return { paymentId: payment.id };
    });
  }

  // ผู้ขอใช้บริการเห็นเฉพาะค่าปรับของตนเอง พนักงานเห็นทั้งหมด
  async list(user: AuthUser, query: ListFinesQueryDto): Promise<FineView[]> {
    const fines = await this.prisma.fine.findMany({
      where: {
        AND: [
          user.type === 'EMPLOYEE' ? {} : { cusId: user.id },
          query.unpaid ? { NOT: { payment: { status: 'PAID' } } } : {},
          !query.unpaid && query.before ? { id: { lt: query.before } } : {},
          query.q?.trim()
            ? {
                OR: [
                  { fineNo: { contains: query.q.trim() } },
                  { bookingNo: { contains: query.q.trim() } },
                ],
              }
            : {},
        ],
      },
      include: FINE_INCLUDE,
      orderBy: { id: 'desc' },
      take: query.unpaid ? undefined : LIST_LIMIT,
    });
    const customers = await this.customersOf(fines);
    return fines.map((fine) => toFineView(fine, customers));
  }

  // ใบเดียว (หน้าใบเสร็จค่าปรับ) — ผู้ขอใช้บริการเปิดได้เฉพาะของตนเอง ของคนอื่น = ไม่พบ
  async get(user: AuthUser, id: number): Promise<FineView> {
    const fine = await this.prisma.fine.findFirst({
      where: {
        id,
        ...(user.type === 'EMPLOYEE' ? {} : { cusId: user.id }),
      },
      include: FINE_INCLUDE,
    });
    if (!fine) throw notFound();
    return toFineView(fine, await this.customersOf([fine]));
  }
}
