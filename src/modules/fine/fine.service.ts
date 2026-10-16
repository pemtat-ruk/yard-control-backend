import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../../common/api-exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PaymentService } from '../payment/payment.service.js';
import { RoundsService } from '../rounds/rounds.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { fromDbDate } from '../../common/service-date.js';
import { usageWindow } from '../booking/domain/rounds.js';
import {
  overtimeFine,
  overtimeMinutesAt,
  type OvertimeFine,
} from './domain/fine-amount.js';
import type { CreateFineDto, FineTargetDto } from './dto/create-fine.dto.js';

const FINE_NO_DIGITS = 6;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 100;
const MINUTES_PER_HOUR = 60;

// เหตุผลที่บันทึกในค่าปรับ (ลูกค้าเห็นในรายการค่าปรับ)
function overtimeReason(fine: OvertimeFine, note?: string): string {
  const hours = Math.floor(fine.overtimeMinutes / MINUTES_PER_HOUR);
  const minutes = fine.overtimeMinutes % MINUTES_PER_HOUR;
  // ไม่แสดงส่วนที่เป็นศูนย์ ("0 ชม. 0 นาที")
  const parts = [
    hours > 0 ? `${hours} ชม.` : '',
    minutes > 0 ? `${minutes} นาที` : '',
  ].filter(Boolean);
  const duration = parts.length > 0 ? parts.join(' ') : 'ไม่ถึง 1 นาที';
  const reason = `จอดเกินเวลา ${duration} (${fine.rounds} รอบ × ${fine.pricePerSlotRound} บาท × ${fine.multiplier})`;
  return note?.trim() ? `${reason} — ${note.trim()}` : reason;
}

export type FineView = {
  id: number;
  fineNo: string;
  customerName: string | null;
  slotCode: string | null;
  reason: string;
  amount: number;
  createdAt: string;
  paymentId: number | null;
  paid: boolean;
};

@Injectable()
export class FineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly rounds: RoundsService,
  ) {}

  // ยอดค่าปรับ ณ ตอนนี้ ให้ผู้ตรวจสอบเห็นก่อนยืนยัน (คำนวณซ้ำตอนบันทึกจริง)
  async quote(
    dto: FineTargetDto,
    now: Date = new Date(),
  ): Promise<OvertimeFine> {
    return (await this.calculate(dto, now)).fine;
  }

  private async calculate(dto: FineTargetDto, now: Date) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: { slots: true, days: { select: { serviceDate: true } } },
    });
    if (!booking || !booking.slots.some((item) => item.slotId === dto.slotId)) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'FINE_BOOKING_INVALID',
        'Booking not found, or it does not use this slot',
      );
    }
    const schedule = (await this.rounds.resolver())(
      fromDbDate(booking.startDate),
    );
    const windows = booking.days.map((day) =>
      usageWindow(
        fromDbDate(day.serviceDate),
        booking.startRound,
        booking.roundCount,
        schedule,
      ),
    );
    const minutes = overtimeMinutesAt(windows, now);
    if (minutes === null) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'FINE_NOT_OVERTIME',
        'This slot is not past its booked time',
      );
    }
    const { fineMultiplier } = await this.settings.current();
    return {
      booking,
      fine: overtimeFine({
        overtimeMinutes: minutes,
        pricePerSlotRound: Number(booking.pricePerSlotRound),
        multiplier: fineMultiplier,
        roundHours: schedule.roundHours,
      }),
    };
  }

  async create(
    user: AuthUser,
    dto: CreateFineDto,
    now: Date = new Date(),
  ): Promise<{ fineId: number; paymentId: number; amount: number }> {
    const { finePaymentDays } = await this.settings.current();
    const { booking, fine: calculated } = await this.calculate(dto, now);

    const { fineId, paymentId } = await this.prisma.$transaction(async (tx) => {
      const payment = await this.payments.createPending(
        tx,
        {
          purpose: 'FINE',
          amount: calculated.amount,
          expiresAt: new Date(now.getTime() + finePaymentDays * MS_PER_DAY),
        },
        now,
      );
      const fine = await tx.fine.create({
        data: {
          // เลขที่จริงต้องใช้ id ที่ฐานข้อมูลออกให้ จึงใส่ค่าชั่วคราวก่อน
          fineNo: payment.transactionNo,
          customerId: booking.customerId,
          slotId: dto.slotId,
          issuedById: user.id,
          reason: overtimeReason(calculated, dto.note),
          amount: calculated.amount,
          paymentId: payment.id,
        },
      });
      await tx.fine.update({
        where: { id: fine.id },
        data: { fineNo: `FN${String(fine.id).padStart(FINE_NO_DIGITS, '0')}` },
      });
      return { fineId: fine.id, paymentId: payment.id };
    });
    await this.audit.record({
      userId: user.id,
      action: 'FINE_CREATE',
      entity: 'fine',
      entityId: fineId,
      detail: {
        bookingId: dto.bookingId,
        amount: calculated.amount,
        rounds: calculated.rounds,
      },
    });
    // หน้าตรวจสอบเปิด QR ให้ลูกค้าที่อยู่หน้างานสแกนได้ทันที
    return { fineId, paymentId, amount: calculated.amount };
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
    if (!fine || (user.type !== 'EMPLOYEE' && fine.customerId !== user.id)) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'RECORD_NOT_FOUND',
        'Fine not found',
      );
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
        await tx.payment.updateMany({
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
  async list(user: AuthUser): Promise<FineView[]> {
    const fines = await this.prisma.fine.findMany({
      where: user.type === 'EMPLOYEE' ? {} : { customerId: user.id },
      include: {
        customer: { select: { fullName: true } },
        slot: { select: { code: true } },
        payment: { select: { status: true } },
      },
      orderBy: { id: 'desc' },
      take: LIST_LIMIT,
    });
    return fines.map((fine) => ({
      id: fine.id,
      fineNo: fine.fineNo,
      customerName: fine.customer?.fullName ?? null,
      slotCode: fine.slot?.code ?? null,
      reason: fine.reason,
      amount: Number(fine.amount),
      createdAt: fine.createdAt.toISOString(),
      paymentId: fine.paymentId,
      paid: fine.payment?.status === 'PAID',
    }));
  }
}
