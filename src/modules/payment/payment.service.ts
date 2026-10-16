import { randomInt } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { Payment, PaymentPurpose, Prisma } from '@prisma/client';
import { ApiException } from '../../common/api-exception.js';
import { fromDbDate } from '../../common/service-date.js';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { SettingsService } from '../settings/settings.service.js';
import { PaymentGateway } from './payment-gateway.js';

export type PaymentView = {
  id: number;
  transactionNo: string;
  purpose: PaymentPurpose;
  amount: number;
  status: Payment['status'];
  qrPayload: string | null;
  expiresAt: string;
  paidAt: string | null;
  bookingId: number | null;
  receiptNo: string | null;
  // true = ระบบใช้ Payment Gateway จำลอง หน้าเว็บแสดงปุ่มจำลองการชำระได้
  mock: boolean;
};

type Tx = Prisma.TransactionClient;

const RANDOM_SUFFIX_LIMIT = 10_000;
const RANDOM_SUFFIX_DIGITS = 4;
const RECEIPT_NO_DIGITS = 8;
const TICKET_BOOKING_DIGITS = 6;

function notFound(): ApiException {
  return new ApiException(
    HttpStatus.NOT_FOUND,
    'RECORD_NOT_FOUND',
    'Payment not found',
  );
}

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGateway,
    private readonly settings: SettingsService,
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
      bookingId?: number;
      amount: number;
      expiresAt: Date;
    },
    now: Date,
  ): Promise<Payment> {
    const { transactionPrefix } = await this.settings.current();
    const transactionNo = this.newTransactionNo(transactionPrefix, now);
    const qr = await this.gateway.createQr({
      transactionNo,
      amount: input.amount,
      expiresAt: input.expiresAt,
    });
    return tx.payment.create({
      data: {
        transactionNo,
        purpose: input.purpose,
        bookingId: input.bookingId,
        amount: input.amount,
        expiresAt: input.expiresAt,
        qrPayload: qr.qrPayload,
        gatewayRef: qr.gatewayRef,
      },
    });
  }

  async getView(user: AuthUser, id: number): Promise<PaymentView> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { booking: true, fine: true, receipt: true },
    });
    if (!payment) throw notFound();
    // ผู้ขอใช้บริการดูได้เฉพาะรายการของตนเอง; ตอบ 404 เหมือนไม่มีรายการ ไม่บอกว่ามีอยู่จริง
    const ownerId = payment.booking?.customerId ?? payment.fine?.customerId;
    if (user.type !== 'EMPLOYEE' && ownerId !== user.id) throw notFound();

    return {
      id: payment.id,
      transactionNo: payment.transactionNo,
      purpose: payment.purpose,
      amount: Number(payment.amount),
      status: payment.status,
      // QR ใช้ได้เฉพาะตอนรอชำระ
      qrPayload: payment.status === 'PENDING' ? payment.qrPayload : null,
      expiresAt: payment.expiresAt.toISOString(),
      paidAt: payment.paidAt?.toISOString() ?? null,
      bookingId: payment.bookingId,
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

  // บันทึกว่าชำระสำเร็จ: ออกใบเสร็จ ยืนยันการจอง และออกตั๋วของวันที่ชำระแล้ว
  // เรียกซ้ำได้ — รายการที่ชำระไปแล้วจะไม่ถูกประมวลซ้ำ
  async settle(id: number, now: Date = new Date()): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id },
        include: { bookingDays: true },
      });
      if (!payment) throw notFound();
      if (payment.status === 'PAID') return;
      if (payment.status !== 'PENDING' || payment.expiresAt <= now) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'PAYMENT_EXPIRED',
          'This payment has expired',
        );
      }

      // เงื่อนไข status ใน where กันสองคำขอพร้อมกันประมวลรายการเดียวกันซ้ำ
      const updated = await tx.payment.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'PAID', paidAt: now },
      });
      if (updated.count === 0) return;

      await tx.receipt.create({
        data: {
          paymentId: id,
          receiptNo: `RC${String(id).padStart(RECEIPT_NO_DIGITS, '0')}`,
        },
      });
      if (payment.bookingId === null) return;

      const bookingId = payment.bookingId;
      await tx.bookingDay.updateMany({
        where: { paymentId: id },
        data: { paidAt: now },
      });
      await tx.booking.updateMany({
        where: { id: bookingId, status: 'PENDING_PAYMENT' },
        data: { status: 'CONFIRMED' },
      });
      const bookingPart = String(bookingId).padStart(
        TICKET_BOOKING_DIGITS,
        '0',
      );
      await tx.ticket.createMany({
        data: payment.bookingDays.map((day) => ({
          bookingId,
          serviceDate: day.serviceDate,
          ticketNo: `TK${bookingPart}${fromDbDate(day.serviceDate).replaceAll('-', '')}`,
        })),
        skipDuplicates: true,
      });
    });
  }
}
