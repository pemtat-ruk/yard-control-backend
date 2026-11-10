import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  addDays,
  toDbDate,
  todayInBangkok,
} from '../../common/service-date.js';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isEmployeeActive } from '../auth/auth.service.js';
import { continuesInNextRound } from '../booking/booking-continuation.js';
import { snapshotBooking } from '../booking/booking-history.js';
import {
  BOOKING_ACTIVE,
  BOOKING_CANCELLED,
  CONFIRMED_BOOKING,
  PAY_CANCELLED,
  PAY_OVERDUE,
  PAY_WAITING,
  PAYMENT_TYPE_CODE,
} from '../booking/domain/booking-status.js';
import { roundsPerDay, usageWindow } from '../booking/domain/rounds.js';
import { fromDueColumns } from '../payment/domain/due.js';
import { RoundsService } from '../rounds/rounds.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { EventsService } from '../events/events.service.js';
import { sortedLabels } from '../yard/domain/slot-label.js';
import {
  loadActiveSlots,
  loadBookingUsages,
  type BookingUsage,
  type SlotRow,
} from '../yard/yard-store.js';
import { crossedRoundBoundary } from './round-boundary.js';

// ทุกแจ้งเตือนจากงานตามเวลามี dedupeKey — ใช้กันส่งซ้ำเมื่องานรันซ้ำ
type NotificationRow = Prisma.NotificationLogCreateManyInput & {
  dedupeKey: string;
};

type UsageAlert = {
  booking: BookingUsage;
  date: string;
  kind: 'EXPIRING' | 'OVERTIME';
};

const JOB_INTERVAL_MS = 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
// ย้อนดูการจองที่หมดเวลาไม่นาน เพื่อแจ้งผู้ตรวจสอบแม้งานรอบก่อนจะพลาดไป
const OVERTIME_NOTIFY_WINDOW_MINUTES = 30;
// Workflow ข้อ 5.1: เตือนเมื่อเหลือไม่เกิน 30 นาทีก่อนครบกำหนดชำระรายวัน
const PAYMENT_DUE_NOTIFY_MINUTES = 30;
// ข้อความที่ SA กำหนดให้บันทึกใน PaymentSchedule.Remark เมื่อระบบยกเลิกเพราะเกินกำหนดชำระ
const OVERDUE_REMARK = 'เกินกำหนดชำระ';
const QR_EXPIRED_REMARK = 'ไม่ชำระภายในเวลาที่กำหนด';

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
    private readonly events: EventsService,
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
        notified: await this.notifyUsage(now),
        paymentReminders: await this.notifyPaymentDue(now),
      };
      if (Object.values(result).some((count) => count > 0)) {
        this.logger.log(result, 'Scheduled jobs made changes');
      }
      // ช่องถูกปล่อย/ยกเลิก หรือขึ้นรอบใหม่ (สถานะเปลี่ยนตามเวลา: เริ่มใช้, หมดเวลา) — ผังของทุกคนโหลดใหม่
      const released = result.expiredPayments + result.cancelledDaily > 0;
      if (released || (await this.roundChanged(now)))
        this.events.slotsChanged();
    } catch (error) {
      this.logger.error(error, 'Scheduled jobs failed');
    } finally {
      this.running = false;
    }
  }

  private lastRunAt?: Date;

  private async roundChanged(now: Date): Promise<boolean> {
    const previous = this.lastRunAt;
    this.lastRunAt = now;
    if (!previous) return false;
    const scheduleFor = await this.rounds.resolver();
    return crossedRoundBoundary(
      previous,
      now,
      scheduleFor(todayInBangkok(now)),
    );
  }

  // QR หมดอายุ: การจองที่ยังไม่เคยชำระถูกยกเลิก (BookingStatus C, PaymentStatus C) และปล่อยช่องจอดที่ถือไว้
  async expirePayments(now: Date): Promise<number> {
    const expired = await this.prisma.paymentTransaction.findMany({
      where: { status: 'PENDING', expiresAt: { lte: now } },
      select: { id: true, bookingNo: true },
    });
    for (const payment of expired) {
      await this.prisma.$transaction(async (tx) => {
        await tx.paymentTransaction.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: { status: 'EXPIRED' },
        });
        await tx.paymentScheduleItem.deleteMany({
          where: {
            paymentId: payment.id,
            schedule: { paymentStatus: PAY_WAITING },
          },
        });
        if (payment.bookingNo === null) return;
        const toCancel = {
          bookingNo: payment.bookingNo,
          bookingStatus: BOOKING_ACTIVE,
          paymentStatus: PAY_WAITING,
        };
        // เก็บประวัติก่อนยกเลิก (เฉพาะใบที่จะถูกยกเลิกจริง)
        if (await tx.bookingHeader.count({ where: toCancel })) {
          await snapshotBooking(tx, payment.bookingNo);
        }
        const cancelled = await tx.bookingHeader.updateMany({
          where: toCancel,
          data: {
            bookingStatus: BOOKING_CANCELLED,
            paymentStatus: PAY_CANCELLED,
            bookingRemark: QR_EXPIRED_REMARK,
            updatedDate: now,
          },
        });
        if (cancelled.count > 0) {
          await tx.paymentSchedule.updateMany({
            where: { bookingNo: payment.bookingNo, paymentStatus: PAY_WAITING },
            data: {
              paymentStatus: PAY_CANCELLED,
              remark: QR_EXPIRED_REMARK,
              updatedDate: now,
            },
          });
        }
      });
    }
    return expired.length;
  }

  // ข้อ 6.1: ไม่ชำระค่าบริการรายวันภายในเที่ยงคืนก่อนวันใช้งาน = ยกเลิกการจองทั้งหมด
  // (BookingStatus C, PaymentStatus O, Remark "เกินกำหนดชำระ" ตาม Data Dictionary)
  async cancelOverdueDaily(now: Date): Promise<number> {
    const today = todayInBangkok(now);
    const candidates = await this.prisma.bookingHeader.findMany({
      where: {
        ...CONFIRMED_BOOKING,
        paymentType: PAYMENT_TYPE_CODE.DAILY,
        schedules: {
          some: {
            paymentStatus: PAY_WAITING,
            dueDate: { lte: toDbDate(today) },
          },
        },
      },
      include: {
        schedules: { where: { paymentStatus: PAY_WAITING } },
      },
    });
    const overdue = candidates.filter((booking) =>
      booking.schedules.some(
        (schedule) => fromDueColumns(schedule.dueDate, schedule.dueTime) <= now,
      ),
    );
    const labels = await this.labelsOf(overdue.map((b) => b.bookingNo));
    for (const booking of overdue) {
      await this.prisma.$transaction(async (tx) => {
        const toCancel = {
          bookingNo: booking.bookingNo,
          bookingStatus: BOOKING_ACTIVE,
        };
        // เก็บประวัติก่อนยกเลิก (เฉพาะใบที่จะถูกยกเลิกจริง)
        if (await tx.bookingHeader.count({ where: toCancel })) {
          await snapshotBooking(tx, booking.bookingNo);
        }
        const cancelled = await tx.bookingHeader.updateMany({
          where: toCancel,
          data: {
            bookingStatus: BOOKING_CANCELLED,
            paymentStatus: PAY_OVERDUE,
            bookingRemark: OVERDUE_REMARK,
            updatedDate: now,
          },
        });
        if (cancelled.count === 0) return;
        await tx.paymentSchedule.updateMany({
          where: { bookingNo: booking.bookingNo, paymentStatus: PAY_WAITING },
          data: {
            paymentStatus: PAY_OVERDUE,
            remark: OVERDUE_REMARK,
            updatedDate: now,
          },
        });
        await tx.paymentTransaction.updateMany({
          where: { bookingNo: booking.bookingNo, status: 'PENDING' },
          data: { status: 'EXPIRED' },
        });
        await tx.notificationLog.create({
          data: {
            recipientType: 'CUSTOMER',
            recipientCode: booking.bookingCusId,
            type: 'BOOKING_CANCELLED',
            title: 'BOOKING_CANCELLED',
            body: this.describe(booking.bookingNo, labels),
            dedupeKey: `cancelled:${booking.bookingNo}`,
          },
        });
      });
    }
    this.events.notificationsCreated(
      overdue.map((booking) => booking.bookingCusId),
    );
    return overdue.length;
  }

  // ผู้ตรวจสอบ = พนักงานที่ยังทำงานอยู่ และมีกลุ่มสิทธิ์ที่ให้สิทธิ์ตรวจลาน
  private async inspectorCodes(): Promise<string[]> {
    const accounts = await this.prisma.accounts_Roles.findMany({
      where: {
        role: {
          isActive: true,
          permissions: {
            some: { action: { actionCode: 'SLOT_INSPECT', isActive: true } },
          },
        },
      },
      select: { empCode: true },
    });
    const codes = [...new Set(accounts.map((account) => account.empCode))];
    const employees = await this.prisma.employeeView.findMany({
      where: { empCode: { in: codes } },
      select: { empCode: true, empStatus: true },
    });
    return employees
      .filter((employee) => isEmployeeActive(employee.empStatus))
      .map((employee) => employee.empCode);
  }

  // ข้อ 4: แจ้งผู้ขอใช้บริการก่อนหมดเวลา และแจ้งผู้ตรวจสอบเมื่อหมดเวลา
  async notifyUsage(now: Date): Promise<number> {
    const today = todayInBangkok(now);
    const { notifyBeforeMinutes } = await this.settings.current();
    const scheduleFor = await this.rounds.resolver();
    const [bookings, inspectors, slots] = await Promise.all([
      loadBookingUsages(
        this.prisma,
        { from: addDays(today, -1), to: today },
        (date) => roundsPerDay(scheduleFor(date)),
        CONFIRMED_BOOKING,
      ),
      this.inspectorCodes(),
      loadActiveSlots(this.prisma),
    ]);
    const slotById = new Map(slots.map((slot) => [slot.id, slot]));

    const alerts = bookings.flatMap((booking): UsageAlert[] =>
      booking.dates.flatMap((date): UsageAlert[] => {
        const { endsAt } = usageWindow(
          date,
          booking.startRound,
          booking.roundCount,
          scheduleFor(date),
        );
        const minutesLeft = (endsAt.getTime() - now.getTime()) / MS_PER_MINUTE;
        if (minutesLeft > 0 && minutesLeft <= notifyBeforeMinutes) {
          return [{ booking, date, kind: 'EXPIRING' }];
        }
        if (minutesLeft <= 0 && minutesLeft > -OVERTIME_NOTIFY_WINDOW_MINUTES) {
          return [{ booking, date, kind: 'OVERTIME' }];
        }
        return [];
      }),
    );

    const rows: NotificationRow[] = [];
    for (const { booking, date, kind } of alerts) {
      // Workflow ข้อ 5: ช่องเดิมมีรอบจองต่อเนื่อง = ใช้งานต่อ ไม่เตือนผู้จองและไม่เรียกผู้ตรวจสอบ
      const continues = await continuesInNextRound(this.prisma, {
        customerId: booking.customerId,
        slotIds: booking.slotIds,
        serviceDate: date,
        startRound: booking.startRound,
        roundCount: booking.roundCount,
        schedule: scheduleFor(date),
      });
      if (continues) continue;
      const body = `${booking.bookingNo} · ${this.slotLabels(booking.slotIds, slotById).join(', ')}`;
      if (kind === 'EXPIRING') {
        rows.push({
          recipientType: 'CUSTOMER',
          recipientCode: booking.customerId,
          type: 'PARKING_EXPIRING',
          title: 'PARKING_EXPIRING',
          body,
          dedupeKey: `expiring:${booking.bookingNo}:${date}`,
        });
      } else {
        rows.push(
          ...inspectors.map((code) => ({
            recipientType: 'EMPLOYEE',
            recipientCode: code,
            type: 'PARKING_OVERTIME',
            title: 'PARKING_OVERTIME',
            body,
            dedupeKey: `overtime:${booking.bookingNo}:${date}:${code}`,
          })),
        );
      }
    }
    return this.createNotificationsOnce(rows);
  }

  // dedupeKey เป็น unique: รันซ้ำแล้วไม่ส่งซ้ำ — SQL Server ไม่มี skipDuplicates จึงกรองแถวที่ส่งแล้วออกก่อน
  // (งานตามเวลารันเครื่องเดียว จึงไม่มีงานอื่นแทรกระหว่างกรองกับบันทึก)
  private async createNotificationsOnce(
    rows: NotificationRow[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const sent = await this.prisma.notificationLog.findMany({
      where: { dedupeKey: { in: rows.map((row) => row.dedupeKey) } },
      select: { dedupeKey: true },
    });
    const sentKeys = new Set(sent.map((row) => row.dedupeKey));
    const fresh = rows.filter((row) => !sentKeys.has(row.dedupeKey));
    if (fresh.length === 0) return 0;
    await this.prisma.notificationLog.createMany({ data: fresh });
    this.events.notificationsCreated(fresh.map((row) => row.recipientCode));
    return fresh.length;
  }

  // Workflow ข้อ 5.1: เตือนผู้จองแบบวันต่อวันเมื่อใกล้ครบกำหนดชำระของวันถัดไป
  async notifyPaymentDue(now: Date): Promise<number> {
    const soon = new Date(
      now.getTime() + PAYMENT_DUE_NOTIFY_MINUTES * MS_PER_MINUTE,
    );
    const today = todayInBangkok(now);
    const candidates = await this.prisma.paymentSchedule.findMany({
      where: {
        paymentStatus: PAY_WAITING,
        dueDate: { gte: toDbDate(today), lte: toDbDate(addDays(today, 1)) },
        booking: { ...CONFIRMED_BOOKING, paymentType: PAYMENT_TYPE_CODE.DAILY },
      },
      include: {
        booking: { select: { bookingCusId: true } },
        detail: { select: { usageDate: true } },
      },
    });
    const due = candidates.filter((schedule) => {
      const at = fromDueColumns(schedule.dueDate, schedule.dueTime);
      return at > now && at <= soon;
    });
    const labels = await this.labelsOf(due.map((item) => item.bookingNo));
    return this.createNotificationsOnce(
      due.map((schedule) => ({
        recipientType: 'CUSTOMER',
        recipientCode: schedule.booking.bookingCusId,
        type: 'PAYMENT_DUE',
        title: 'PAYMENT_DUE',
        body: this.describe(schedule.bookingNo, labels),
        dedupeKey: `due:${schedule.bookingNo}:${schedule.sequenceNo}`,
      })),
    );
  }

  private slotLabels(slotIds: number[], slotById: Map<number, SlotRow>) {
    return sortedLabels(
      slotIds.flatMap((id) => {
        const slot = slotById.get(id);
        return slot ? [slot] : [];
      }),
    );
  }

  // รหัสช่องของแต่ละใบจอง สำหรับข้อความแจ้งเตือน
  private async labelsOf(bookingNos: string[]): Promise<Map<string, string[]>> {
    if (bookingNos.length === 0) return new Map();
    const [details, slots] = await Promise.all([
      this.prisma.bookingDetail.findMany({
        where: { bookingNo: { in: bookingNos } },
        select: {
          bookingNo: true,
          parkingSlotId: true,
        },
      }),
      loadActiveSlots(this.prisma),
    ]);
    const slotById = new Map(slots.map((slot) => [slot.id, slot]));
    const idsOf = new Map<string, Set<number>>();
    for (const detail of details) {
      const ids = idsOf.get(detail.bookingNo) ?? new Set<number>();
      ids.add(Number(detail.parkingSlotId));
      idsOf.set(detail.bookingNo, ids);
    }
    return new Map(
      [...idsOf.entries()].map(([bookingNo, ids]) => [
        bookingNo,
        this.slotLabels([...ids], slotById),
      ]),
    );
  }

  private describe(bookingNo: string, labels: Map<string, string[]>): string {
    return `${bookingNo} · ${(labels.get(bookingNo) ?? []).join(', ')}`;
  }
}
