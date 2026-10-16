import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  addDays,
  fromDbDate,
  toDbDate,
  todayInBangkok,
} from '../../common/service-date.js';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { continuesInNextRound } from '../booking/booking-continuation.js';
import { bookedDatesWithin, usageWindow } from '../booking/domain/rounds.js';
import { RoundsService } from '../rounds/rounds.service.js';
import { SettingsService } from '../settings/settings.service.js';

type NotificationRow = Prisma.NotificationCreateManyInput;

const USAGE_BOOKING_INCLUDE = {
  slots: { include: { slot: { select: { code: true } } } },
  days: { select: { serviceDate: true } },
} satisfies Prisma.BookingInclude;

type UsageBooking = Prisma.BookingGetPayload<{
  include: typeof USAGE_BOOKING_INCLUDE;
}>;

type UsageAlert = {
  booking: UsageBooking;
  date: string;
  kind: 'EXPIRING' | 'OVERTIME';
};

const JOB_INTERVAL_MS = 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
// ย้อนดูการจองที่หมดเวลาไม่นาน เพื่อแจ้งผู้ตรวจสอบแม้งานรอบก่อนจะพลาดไป
const OVERTIME_NOTIFY_WINDOW_MINUTES = 30;
// Workflow ข้อ 5.1: เตือนเมื่อเหลือไม่เกิน 30 นาทีก่อนครบกำหนดชำระรายวัน
const PAYMENT_DUE_NOTIFY_MINUTES = 30;

// งานที่ระบบทำเองตามเวลา (ข้อ 4, 6.1) — ทุกงานรันซ้ำได้โดยผลไม่เพี้ยน
// รันใน process เดียวกับ API ทุกนาที; เมื่อมีหลาย instance ให้ตั้ง RUN_JOBS=true ไว้ตัวเดียว
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly rounds: RoundsService,
  ) {}

  onModuleInit(): void {
    if (!env.runJobs || env.nodeEnv === 'test') return;
    this.timer = setInterval(() => void this.runAll(), JOB_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async runAll(now: Date = new Date()): Promise<void> {
    // รอบก่อนยังไม่จบ = ข้ามรอบนี้ ไม่รันซ้อนกัน
    if (this.running) return;
    this.running = true;
    try {
      const result = {
        expiredPayments: await this.expirePayments(now),
        cancelledDaily: await this.cancelOverdueDaily(now),
        completed: await this.completeBookings(now),
        notified: await this.notifyUsage(now),
        paymentReminders: await this.notifyPaymentDue(now),
      };
      if (Object.values(result).some((count) => count > 0)) {
        this.logger.log(result, 'Scheduled jobs made changes');
      }
    } catch (error) {
      this.logger.error(error, 'Scheduled jobs failed');
    } finally {
      this.running = false;
    }
  }

  // QR หมดอายุ: การจองที่ยังไม่เคยชำระถูกยกเลิกและปล่อยช่องจอดที่ถือไว้
  async expirePayments(now: Date): Promise<number> {
    const expired = await this.prisma.payment.findMany({
      where: { status: 'PENDING', expiresAt: { lte: now } },
      select: { id: true, bookingId: true },
    });
    for (const payment of expired) {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: { status: 'EXPIRED' },
        });
        await tx.bookingDay.updateMany({
          where: { paymentId: payment.id, paidAt: null },
          data: { paymentId: null },
        });
        if (payment.bookingId === null) return;
        const cancelled = await tx.booking.updateMany({
          where: { id: payment.bookingId, status: 'PENDING_PAYMENT' },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            cancelReason: 'PAYMENT_EXPIRED',
          },
        });
        if (cancelled.count > 0) {
          await tx.slotOccupancy.deleteMany({
            where: { bookingId: payment.bookingId },
          });
        }
      });
    }
    return expired.length;
  }

  // ข้อ 6.1: ไม่ชำระค่าบริการรายวันภายในเที่ยงคืนก่อนวันใช้งาน = ยกเลิกการจองทั้งหมด
  async cancelOverdueDaily(now: Date): Promise<number> {
    const overdue = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        paymentPlan: 'DAILY',
        days: { some: { paidAt: null, dueAt: { lte: now } } },
      },
      include: { slots: { include: { slot: { select: { code: true } } } } },
    });
    const today = toDbDate(todayInBangkok(now));
    for (const booking of overdue) {
      await this.prisma.$transaction(async (tx) => {
        const cancelled = await tx.booking.updateMany({
          where: { id: booking.id, status: 'CONFIRMED' },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            cancelReason: 'DAILY_PAYMENT_OVERDUE',
          },
        });
        if (cancelled.count === 0) return;
        // ปล่อยเฉพาะวันที่ยังมาไม่ถึง วันที่ใช้ไปแล้วเก็บไว้เป็นประวัติ
        await tx.slotOccupancy.deleteMany({
          where: { bookingId: booking.id, serviceDate: { gte: today } },
        });
        await tx.payment.updateMany({
          where: { bookingId: booking.id, status: 'PENDING' },
          data: { status: 'EXPIRED' },
        });
        await tx.notification.create({
          data: {
            userId: booking.customerId,
            type: 'BOOKING_CANCELLED',
            title: 'BOOKING_CANCELLED',
            body: this.describe(booking),
            dedupeKey: `cancelled:${booking.id}`,
          },
        });
      });
    }
    return overdue.length;
  }

  // การจองที่ใช้บริการครบทุกวันแล้ว
  async completeBookings(now: Date): Promise<number> {
    const candidates = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        endDate: { lte: toDbDate(todayInBangkok(now)) },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        startRound: true,
        roundCount: true,
      },
    });
    const scheduleFor = await this.rounds.resolver();
    const finished = candidates.filter(
      (booking) =>
        usageWindow(
          fromDbDate(booking.endDate),
          booking.startRound,
          booking.roundCount,
          scheduleFor(fromDbDate(booking.startDate)),
        ).endsAt <= now,
    );
    const result = await this.prisma.booking.updateMany({
      where: { id: { in: finished.map((booking) => booking.id) } },
      data: { status: 'COMPLETED' },
    });
    return result.count;
  }

  // ข้อ 4: แจ้งผู้ขอใช้บริการก่อนหมดเวลา และแจ้งผู้ตรวจสอบเมื่อหมดเวลา
  async notifyUsage(now: Date): Promise<number> {
    const today = todayInBangkok(now);
    const { notifyBeforeMinutes } = await this.settings.current();
    const [bookings, inspectors] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          status: { in: ['CONFIRMED', 'COMPLETED'] },
          startDate: { lte: toDbDate(today) },
          endDate: { gte: toDbDate(addDays(today, -1)) },
        },
        include: USAGE_BOOKING_INCLUDE,
      }),
      this.prisma.userPermission.findMany({
        where: { permission: 'SLOT_INSPECT', user: { isActive: true } },
        select: { userId: true },
      }),
    ]);

    const scheduleFor = await this.rounds.resolver();
    const alerts = bookings.flatMap((booking): UsageAlert[] => {
      const schedule = scheduleFor(fromDbDate(booking.startDate));
      // เฉพาะวันที่จองจริง — การจองอาจข้ามบางวันในช่วง
      const days = bookedDatesWithin(
        booking.days.map((day) => fromDbDate(day.serviceDate)),
        addDays(today, -1),
        today,
      );
      return days.flatMap((date): UsageAlert[] => {
        const { endsAt } = usageWindow(
          date,
          booking.startRound,
          booking.roundCount,
          schedule,
        );
        const minutesLeft = (endsAt.getTime() - now.getTime()) / MS_PER_MINUTE;
        if (minutesLeft > 0 && minutesLeft <= notifyBeforeMinutes) {
          return [{ booking, date, kind: 'EXPIRING' }];
        }
        if (minutesLeft <= 0 && minutesLeft > -OVERTIME_NOTIFY_WINDOW_MINUTES) {
          return [{ booking, date, kind: 'OVERTIME' }];
        }
        return [];
      });
    });

    const rows: NotificationRow[] = [];
    for (const { booking, date, kind } of alerts) {
      // Workflow ข้อ 5: ช่องเดิมมีรอบจองต่อเนื่อง = ใช้งานต่อ ไม่เตือนผู้จองและไม่เรียกผู้ตรวจสอบ
      const continues = await continuesInNextRound(this.prisma, {
        customerId: booking.customerId,
        slotIds: booking.slots.map((item) => item.slotId),
        serviceDate: date,
        startRound: booking.startRound,
        roundCount: booking.roundCount,
        schedule: scheduleFor(fromDbDate(booking.startDate)),
      });
      if (continues) continue;
      const body = this.describe(booking);
      if (kind === 'EXPIRING') {
        rows.push({
          userId: booking.customerId,
          type: 'PARKING_EXPIRING',
          title: 'PARKING_EXPIRING',
          body,
          dedupeKey: `expiring:${booking.id}:${date}`,
        });
      } else {
        rows.push(
          ...inspectors.map(({ userId }) => ({
            userId,
            type: 'PARKING_OVERTIME' as const,
            title: 'PARKING_OVERTIME',
            body,
            dedupeKey: `overtime:${booking.id}:${date}:${userId}`,
          })),
        );
      }
    }
    // dedupeKey เป็น unique: รันซ้ำแล้วไม่ส่งซ้ำ
    const result = await this.prisma.notification.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return result.count;
  }

  // Workflow ข้อ 5.1: เตือนผู้จองแบบวันต่อวันเมื่อใกล้ครบกำหนดชำระของวันถัดไป
  async notifyPaymentDue(now: Date): Promise<number> {
    const soon = new Date(
      now.getTime() + PAYMENT_DUE_NOTIFY_MINUTES * MS_PER_MINUTE,
    );
    const days = await this.prisma.bookingDay.findMany({
      where: {
        paidAt: null,
        dueAt: { gt: now, lte: soon },
        booking: { status: 'CONFIRMED', paymentPlan: 'DAILY' },
      },
      include: { booking: { include: USAGE_BOOKING_INCLUDE } },
    });
    const result = await this.prisma.notification.createMany({
      data: days.map((day) => ({
        userId: day.booking.customerId,
        type: 'PAYMENT_DUE' as const,
        title: 'PAYMENT_DUE',
        body: this.describe(day.booking),
        dedupeKey: `due:${day.bookingId}:${fromDbDate(day.serviceDate)}`,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  private describe(booking: {
    bookingNo: string;
    slots: { slot: { code: string } }[];
  }): string {
    const codes = booking.slots.map((item) => item.slot.code).sort();
    return `${booking.bookingNo} · ${codes.join(', ')}`;
  }
}
