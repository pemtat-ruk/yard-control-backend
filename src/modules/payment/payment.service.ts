import { randomInt } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { PaymentTransaction, Prisma } from '@prisma/client';
import { ApiException } from '../../common/api-exception.js';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  BOOKING_ACTIVE,
  PAY_PAID,
  PAY_WAITING,
} from '../booking/domain/booking-status.js';
import { snapshotBooking } from '../booking/booking-history.js';
import { SettingsService } from '../settings/settings.service.js';
import { PaymentGateway } from './payment-gateway.js';
import { EventsService } from '../events/events.service.js';
import type { PaymentPurpose, PaymentStatus } from './domain/payment-kind.js';
import { vatIncluded } from './domain/vat.js';

export type PaymentView = {
  id: number;
  transactionNo: string;
  purpose: PaymentPurpose;
  amount: number;
  status: PaymentStatus;
  qrPayload: string | null;
  expiresAt: string;
  paidAt: string | null;
  bookingId: string | null; // BookingNo
  receiptNo: string | null;
  // true = ระบบใช้ Payment Gateway จำลอง หน้าเว็บแสดงปุ่มจำลองการชำระได้
  mock: boolean;
};

type Tx = Prisma.TransactionClient;

const RANDOM_SUFFIX_LIMIT = 10_000;
const RANDOM_SUFFIX_DIGITS = 4;
const RECEIPT_NO_DIGITS = 8;

function notFound(): ApiException {
  return new ApiException(
    HttpStatus.NOT_FOUND,
    'RECORD_NOT_FOUND',
    'Payment not found',
  );
}

// [เรา] ธุรกรรม QR และใบเสร็จ — รอ spec Payment Gateway
@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGateway,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
  ) {}

  // ข้อ 7: เลขธุรกรรมขึ้นต้นด้วย Transaction Prefix Code ของ YCS ตามด้วยเวลา (UTC) และเลขสุ่ม
  private newTransactionNo(prefix: string, now: Date): string {
    const stamp = now.toISOString().replace(/\D/g, '').slice(2, 14);
    const suffix = String(randomInt(RANDOM_SUFFIX_LIMIT)).padStart(
      RANDOM_SUFFIX_DIGITS,
      '0',
    );
    return `${prefix}${stamp}${suffix}`;
  }

  // สร้างรายการรอชำระพร้อม QR ภายใน transaction ของผู้เรียก
  async createPending(
    tx: Tx,
    input: {
      purpose: PaymentPurpose;
      bookingNo?: string;
      amount: number;
      expiresAt: Date;
    },
    now: Date,
  ): Promise<PaymentTransaction> {
    const { transactionPrefix } = await this.settings.current();
    const transactionNo = this.newTransactionNo(transactionPrefix, now);
    const qr = await this.gateway.createQr({
      transactionNo,
      amount: input.amount,
      expiresAt: input.expiresAt,
    });
    return tx.paymentTransaction.create({
      data: {
        transactionNo,
        purpose: input.purpose,
        bookingNo: input.bookingNo,
        amount: input.amount,
        expiresAt: input.expiresAt,
        qrPayload: qr.qrPayload,
        gatewayRef: qr.gatewayRef,
      },
    });
  }

  async getView(user: AuthUser, id: number): Promise<PaymentView> {
    const payment = await this.prisma.paymentTransaction.findUnique({
      where: { id },
      include: { booking: true, fine: true, receipt: true },
    });
    if (!payment) throw notFound();
    // ผู้ขอใช้บริการดูได้เฉพาะรายการของตนเอง; ตอบ 404 เหมือนไม่มีรายการ ไม่บอกว่ามีอยู่จริง
    const ownerId = payment.booking?.bookingCusId ?? payment.fine?.cusId;
    if (user.type !== 'EMPLOYEE' && ownerId !== user.id) throw notFound();

    return {
      id: payment.id,
      transactionNo: payment.transactionNo,
      // CHECK constraint ของตารางคุมค่าทั้งสองคอลัมน์ไว้แล้ว
      purpose: payment.purpose as PaymentPurpose,
      amount: Number(payment.amount),
      status: payment.status as PaymentStatus,
      // QR ใช้ได้เฉพาะตอนรอชำระ
      qrPayload: payment.status === 'PENDING' ? payment.qrPayload : null,
      expiresAt: payment.expiresAt.toISOString(),
      paidAt: payment.paidAt?.toISOString() ?? null,
      bookingId: payment.bookingNo,
      receiptNo: payment.receipt?.receiptNo ?? null,
      mock: env.paymentGatewayMode === 'mock',
    };
  }

  // ใช้แทน webhook ของ Payment Gateway จนกว่าจะเชื่อมของจริง
  async mockPay(user: AuthUser, id: number): Promise<PaymentView> {
    if (env.paymentGatewayMode !== 'mock') throw notFound();
    await this.getView(user, id);
    await this.settle(id);
    return this.getView(user, id);
  }

  // บันทึกว่าชำระสำเร็จ: ออกใบเสร็จ ปิดงวดที่ชำระ และยืนยันการจอง (ตั๋วของวันที่ชำระแล้วคิดจากงวดที่ชำระ)
  // เรียกซ้ำได้ — รายการที่ชำระไปแล้วจะไม่ถูกประมวลซ้ำ
  async settle(id: number, now: Date = new Date()): Promise<void> {
    // ผู้เกี่ยวข้องกับรายการที่เพิ่งชำระสำเร็จ (null = ไม่มีอะไรเปลี่ยน) — แจ้งหน้าเว็บหลัง transaction สำเร็จ
    let notify: string[] | null = null;
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.paymentTransaction.findUnique({
        where: { id },
        include: {
          schedules: true,
          booking: { select: { bookingCusId: true, createdBy: true } },
          fine: { select: { cusId: true, issuedBy: true } },
        },
      });
      if (!payment) throw notFound();
      if (payment.status === 'PAID') return;
      // QR ค่าจองที่ไม่มีงวดผูกอยู่แล้ว = ถูก QR ใหม่แทน (งวดเหล่านั้นอาจชำระด้วย QR อื่นไปแล้ว) ห้ามรับเงินซ้ำ
      const superseded =
        payment.purpose === 'BOOKING' && payment.schedules.length === 0;
      if (
        payment.status !== 'PENDING' ||
        payment.expiresAt <= now ||
        superseded
      ) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'PAYMENT_EXPIRED',
          'This payment has expired',
        );
      }

      // เงื่อนไข status ใน where กันสองคำขอพร้อมกันประมวลรายการเดียวกันซ้ำ
      const updated = await tx.paymentTransaction.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'PAID', paidAt: now },
      });
      if (updated.count === 0) return;
      notify = [
        payment.booking?.bookingCusId,
        payment.booking?.createdBy,
        payment.fine?.cusId,
        payment.fine?.issuedBy,
      ].filter((code): code is string => typeof code === 'string');

      // ใบกำกับภาษีอย่างย่อ: บันทึกภาษี ณ วันที่ออก ไม่คำนวณใหม่ตอนเปิดดู
      const vat = vatIncluded(Number(payment.amount));
      await tx.receipt.create({
        data: {
          paymentId: id,
          receiptNo: `RC${String(id).padStart(RECEIPT_NO_DIGITS, '0')}`,
          vatRatePercent: vat.ratePercent,
          amountBeforeVat: vat.beforeVat,
          vatAmount: vat.vat,
        },
      });
      if (payment.bookingNo === null) return;

      // เก็บประวัติใบจองก่อนเปลี่ยนสถานะงวด/ใบจองเป็นชำระแล้ว
      await snapshotBooking(tx, payment.bookingNo);
      await tx.paymentSchedule.updateMany({
        where: {
          payScheduleId: {
            in: payment.schedules.map((item) => item.payScheduleId),
          },
        },
        data: {
          paymentStatus: PAY_PAID,
          paidAt: now,
          updatedBy: payment.booking?.bookingCusId,
          updatedDate: now,
        },
      });
      // งวดแรกชำระแล้ว = การจองยืนยัน (PaymentStatus ของใบจอง W → P)
      await tx.bookingHeader.updateMany({
        where: {
          bookingNo: payment.bookingNo,
          bookingStatus: BOOKING_ACTIVE,
          paymentStatus: PAY_WAITING,
        },
        data: { paymentStatus: PAY_PAID, paidAt: now, updatedDate: now },
      });
    });
    if (notify) {
      this.events.paymentSettled(id, notify);
      this.events.slotsChanged();
    }
  }
}
