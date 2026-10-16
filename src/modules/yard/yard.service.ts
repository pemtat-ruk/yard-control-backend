import { HttpStatus, Injectable } from '@nestjs/common';
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
import { hasPermission } from '../auth/domain/permissions.js';
import {
  bookedDatesWithin,
  expandRounds,
  MAX_ADVANCE_DAYS,
  roundsPerDay,
  usageWindow,
  validateBookingRequest,
  type BookingRequest,
  type RoundSchedule,
} from '../booking/domain/rounds.js';
import { RoundsService } from '../rounds/rounds.service.js';
import { freeSlotCount, type Occupancy } from './domain/availability.js';
import {
  isBookableBy,
  resolveStatus,
  visibleStatus,
  type SlotBaseStatus,
  type SlotStatus,
  type SlotViewer,
} from './domain/slot-status.js';
import { checkInspectionUndo } from './domain/inspection-undo.js';
import { usagePhase } from './domain/usage.js';
import type {
  CreateLotDto,
  CreateSlotDto,
  RecordInspectionDto,
  UpdateLotDto,
  UpdateSlotStatusDto,
} from './dto/yard.dto.js';

export type SlotView = {
  id: number;
  lot: string;
  code: string;
  status: SlotStatus;
  bookable: boolean;
};

// รายละเอียดการใช้งานของช่อง — ส่งให้เฉพาะพนักงาน ไม่ส่งให้ผู้ขอใช้บริการ
export type SlotUsage = {
  bookingId: number;
  bookingNo: string;
  customerId: number;
  customerName: string;
  serviceDate: string;
  startsAt: string;
  endsAt: string;
  // ค่าปรับที่บันทึกแล้วหลังหมดเวลาของการใช้งานนี้ (กันปรับซ้ำ และให้รู้ว่ารอชำระหรือชำระแล้ว)
  fine: { id: number; amount: number; paid: boolean } | null;
};

export type LiveSlotView = SlotView & { usage?: SlotUsage };

// จำนวนช่องที่ยังจองได้ สำหรับปุ่มรอบและปุ่มวันในหน้าจอง — null = คำขอนั้นจองไม่ได้ตามกติกา (เช่น รอบที่จบไปแล้ว)
export type AvailabilitySummary = {
  total: number; // ช่องที่เปิดให้ผู้ดูคนนี้จอง (ไม่นับที่ถูกจองแล้ว)
  rounds: { index: number; available: number | null }[]; // ช่วงวันเดิม เปลี่ยนเฉพาะรอบเริ่ม
  days: { date: string; available: number | null }[]; // วันที่จองล่วงหน้าได้ รอบเดิม จองวันเดียว
};
export type LiveYard = { now: string; slots: LiveSlotView[] };

export type LayoutLot = {
  id: number;
  code: string;
  name: string;
  isOpen: boolean;
  slots: { id: number; code: string; baseStatus: SlotBaseStatus }[];
};

// การจองที่ถือช่องจอดอยู่ (รวมที่รอชำระเงิน)
const HOLDING_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED'] as const;
// บล็อกการใช้งานของวันก่อนหน้ายังอาจค้างสถานะหมดเวลาอยู่ จึงย้อนดูการจองถึง 2 วันบริการ
const LIVE_LOOKBACK_DAYS = 2;

export function viewerOf(user: AuthUser): SlotViewer {
  if (hasPermission(user, 'SLOT_INSPECT')) return 'INSPECTOR';
  if (hasPermission(user, 'BOOKING_CREATE_ON_BEHALF'))
    return 'CUSTOMER_SERVICE';
  return user.type === 'EMPLOYEE' ? 'STAFF' : 'CUSTOMER';
}

@Injectable()
export class YardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rounds: RoundsService,
  ) {}

  private findActiveSlots() {
    return this.prisma.parkingSlot.findMany({
      where: { deletedAt: null, lot: { deletedAt: null } },
      include: { lot: true },
      orderBy: [
        { lot: { sortOrder: 'asc' } },
        { lotId: 'asc' },
        { code: 'asc' },
      ],
    });
  }

  // ช่องจอดทั้งหมดพร้อมสถานะ ณ ช่วงเวลาที่จะจอง (ทุกวันในช่วง ใช้ช่วงเวลาเดียวกับวันแรก)
  async getAvailability(
    user: AuthUser,
    request: BookingRequest,
  ): Promise<SlotView[]> {
    const scheduleFor = await this.rounds.resolver();
    const ruleErrors = validateBookingRequest(
      request,
      todayInBangkok(),
      scheduleFor,
    );
    if (ruleErrors.length > 0) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'BOOKING_INVALID',
        'Booking request breaks booking rules',
        ruleErrors,
      );
    }
    const viewer = viewerOf(user);
    const takenSlotIds = await this.findTakenSlotIds(
      request,
      scheduleFor(request.startDate),
    );
    const slots = await this.findActiveSlots();

    return slots.map((slot) => {
      const status = resolveStatus({
        baseStatus: slot.baseStatus,
        lotOpen: slot.lot.isOpen,
        occupied: takenSlotIds.has(slot.id),
        overtime: false,
      });
      return {
        id: slot.id,
        lot: slot.lot.code,
        code: slot.code,
        status: visibleStatus(status, viewer),
        bookable: isBookableBy(status, viewer),
      };
    });
  }

  // สรุปความว่างของทุกรอบเริ่ม (ช่วงวันเดิม) และทุกวันที่จองล่วงหน้าได้ (รอบเดิม) — ดึง occupancy ครั้งเดียวแล้วนับในหน่วยความจำ
  async getAvailabilitySummary(
    user: AuthUser,
    request: BookingRequest,
    now: Date = new Date(),
  ): Promise<AvailabilitySummary> {
    const today = todayInBangkok(now);
    const viewer = viewerOf(user);
    const scheduleFor = await this.rounds.resolver();
    const slots = await this.findActiveSlots();
    const bookableIds = slots
      .filter((slot) =>
        isBookableBy(
          resolveStatus({
            baseStatus: slot.baseStatus,
            lotOpen: slot.lot.isOpen,
            occupied: false,
            overtime: false,
          }),
          viewer,
        ),
      )
      .map((slot) => slot.id);

    const roundRequests = Array.from(
      { length: roundsPerDay(scheduleFor(request.startDate)) },
      (_, index) => ({
        ...request,
        startRound: index,
      }),
    );
    const dayRequests = Array.from(
      { length: MAX_ADVANCE_DAYS + 1 },
      (_, offset) => {
        const date = addDays(today, offset);
        return {
          startDate: date,
          endDate: date,
          startRound: request.startRound,
          roundCount: request.roundCount,
        };
      },
    );
    const isValid = (candidate: BookingRequest) =>
      validateBookingRequest(candidate, today, scheduleFor, now).length === 0;
    const dates = [...roundRequests, ...dayRequests]
      .filter(isValid)
      .flatMap((candidate) =>
        expandRounds(candidate, scheduleFor(candidate.startDate)),
      )
      .map((key) => key.serviceDate)
      .sort();
    const occupancies: Occupancy[] =
      dates.length === 0
        ? []
        : (
            await this.prisma.slotOccupancy.findMany({
              where: {
                serviceDate: {
                  gte: toDbDate(dates[0]),
                  lte: toDbDate(dates[dates.length - 1]),
                },
              },
              select: { slotId: true, serviceDate: true, roundIndex: true },
            })
          ).map((row) => ({
            ...row,
            serviceDate: fromDbDate(row.serviceDate),
          }));
    const count = (candidate: BookingRequest) =>
      isValid(candidate)
        ? freeSlotCount(
            bookableIds,
            occupancies,
            candidate,
            scheduleFor(candidate.startDate),
          )
        : null;

    return {
      total: bookableIds.length,
      rounds: roundRequests.map((candidate) => ({
        index: candidate.startRound,
        available: count(candidate),
      })),
      days: dayRequests.map((candidate) => ({
        date: candidate.startDate,
        available: count(candidate),
      })),
    };
  }

  private async findTakenSlotIds(
    request: BookingRequest,
    schedule: RoundSchedule,
  ): Promise<Set<number>> {
    const keys = expandRounds(request, schedule);
    const wanted = new Set(
      keys.map((key) => `${key.serviceDate}:${key.roundIndex}`),
    );
    const dates = keys.map((key) => key.serviceDate).sort();
    // ดึงเป็นช่วงวันแล้วกรองในหน่วยความจำ เพราะการจองระยะยาวไม่จำกัดจำนวนวัน
    const occupancies = await this.prisma.slotOccupancy.findMany({
      where: {
        serviceDate: {
          gte: toDbDate(dates[0]),
          lte: toDbDate(dates[dates.length - 1]),
        },
        roundIndex: { in: [...new Set(keys.map((key) => key.roundIndex))] },
      },
      select: { slotId: true, serviceDate: true, roundIndex: true },
    });
    return new Set(
      occupancies
        .filter((row) =>
          wanted.has(`${fromDbDate(row.serviceDate)}:${row.roundIndex}`),
        )
        .map((row) => row.slotId),
    );
  }

  // สถานะ ณ เวลานี้ของทุกช่อง รวมช่องที่หมดเวลาแล้ว (ข้อ 4, 5)
  async getLive(user: AuthUser, now: Date = new Date()): Promise<LiveYard> {
    const viewer = viewerOf(user);
    const today = todayInBangkok(now);
    const since = addDays(today, -LIVE_LOOKBACK_DAYS);

    const [slots, bookings, vacated] = await Promise.all([
      this.findActiveSlots(),
      this.prisma.booking.findMany({
        where: {
          status: { in: [...HOLDING_STATUSES, 'COMPLETED'] },
          startDate: { lte: toDbDate(today) },
          endDate: { gte: toDbDate(since) },
        },
        include: {
          slots: true,
          customer: { select: { fullName: true } },
          days: { select: { serviceDate: true } },
        },
      }),
      this.prisma.slotInspection.findMany({
        where: { result: 'VACATED', serviceDate: { gte: toDbDate(since) } },
        select: { slotId: true, bookingId: true, serviceDate: true },
      }),
    ]);
    const vacatedKeys = new Set(
      vacated.map(
        (row) =>
          `${row.slotId}:${row.bookingId}:${fromDbDate(row.serviceDate)}`,
      ),
    );

    // ต่อช่อง: เก็บการใช้งานที่กำลังเกิดขึ้น และการใช้งานที่หมดเวลาล่าสุด
    const scheduleFor = await this.rounds.resolver();
    const active = new Map<number, SlotUsage>();
    const overtime = new Map<number, SlotUsage>();
    for (const booking of bookings) {
      const schedule = scheduleFor(fromDbDate(booking.startDate));
      // เฉพาะวันที่จองจริง — การจองอาจข้ามบางวันในช่วง
      const days = bookedDatesWithin(
        booking.days.map((day) => fromDbDate(day.serviceDate)),
        since,
        today,
      );
      for (const serviceDate of days) {
        const window = usageWindow(
          serviceDate,
          booking.startRound,
          booking.roundCount,
          schedule,
        );
        for (const { slotId } of booking.slots) {
          const isVacated = vacatedKeys.has(
            `${slotId}:${booking.id}:${serviceDate}`,
          );
          const phase = usagePhase(window, now, isVacated);
          const usage: SlotUsage = {
            bookingId: booking.id,
            bookingNo: booking.bookingNo,
            customerId: booking.customerId,
            customerName: booking.customer.fullName,
            serviceDate,
            startsAt: window.startsAt.toISOString(),
            endsAt: window.endsAt.toISOString(),
            fine: null,
          };
          if (phase === 'ACTIVE') active.set(slotId, usage);
          // การจองที่ยังไม่ชำระเงินไม่นับเป็นการจอดเกินเวลา
          const paid = booking.status !== 'PENDING_PAYMENT';
          const latest = overtime.get(slotId);
          if (
            phase === 'OVERTIME' &&
            paid &&
            (!latest || latest.endsAt < usage.endsAt)
          ) {
            overtime.set(slotId, usage);
          }
        }
      }
    }

    const canSeeUsage = viewer !== 'CUSTOMER';
    if (canSeeUsage) await this.attachFines(overtime);
    return {
      now: now.toISOString(),
      slots: slots.map((slot) => {
        const status = resolveStatus({
          baseStatus: slot.baseStatus,
          lotOpen: slot.lot.isOpen,
          occupied: active.has(slot.id),
          overtime: overtime.has(slot.id),
        });
        const usage = active.get(slot.id) ?? overtime.get(slot.id);
        return {
          id: slot.id,
          lot: slot.lot.code,
          code: slot.code,
          status: visibleStatus(status, viewer),
          bookable: isBookableBy(status, viewer),
          usage: canSeeUsage ? usage : undefined,
        };
      }),
    };
  }

  // ค่าปรับของช่องที่หมดเวลา: ออกให้ผู้จองคนเดิม ที่ช่องเดิม หลังเวลาที่หมด (ล่าสุดก่อน)
  private async attachFines(overtime: Map<number, SlotUsage>): Promise<void> {
    if (overtime.size === 0) return;
    const usages = [...overtime.values()];
    const earliestEnd = usages.map((usage) => usage.endsAt).sort()[0];
    const fines = await this.prisma.fine.findMany({
      where: {
        slotId: { in: [...overtime.keys()] },
        createdAt: { gte: new Date(earliestEnd) },
      },
      include: { payment: { select: { status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    for (const [slotId, usage] of overtime) {
      const fine = fines.find(
        (item) =>
          item.slotId === slotId &&
          item.customerId === usage.customerId &&
          item.createdAt.toISOString() >= usage.endsAt,
      );
      usage.fine = fine
        ? {
            id: fine.id,
            amount: Number(fine.amount),
            paid: fine.payment?.status === 'PAID',
          }
        : null;
    }
  }

  // คืน id ของผลตรวจ ให้หน้าจอเลิกทำได้ (ดู undoInspection)
  async recordInspection(
    user: AuthUser,
    dto: RecordInspectionDto,
  ): Promise<{ id: number }> {
    const bookingSlot = await this.prisma.bookingSlot.findUnique({
      where: {
        bookingId_slotId: { bookingId: dto.bookingId, slotId: dto.slotId },
      },
    });
    if (!bookingSlot) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'RECORD_NOT_FOUND',
        'This booking does not use this slot',
      );
    }
    const inspection = await this.prisma.slotInspection.create({
      data: {
        slotId: dto.slotId,
        bookingId: dto.bookingId,
        serviceDate: toDbDate(dto.serviceDate),
        result: dto.result,
        inspectorId: user.id,
      },
    });
    return { id: inspection.id };
  }

  // เลิกทำ "รถออกแล้ว" ที่เพิ่งกด: ลบผลตรวจ ช่องกลับเป็นหมดเวลาตามเดิม
  async undoInspection(
    user: AuthUser,
    id: number,
    now: Date = new Date(),
  ): Promise<void> {
    const inspection = await this.prisma.slotInspection.findUnique({
      where: { id },
    });
    if (!inspection) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'RECORD_NOT_FOUND',
        'Inspection not found',
      );
    }
    const error = checkInspectionUndo(inspection, user.id, now);
    if (error) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        error,
        error === 'INSPECTION_UNDO_EXPIRED'
          ? 'Too late to undo this result'
          : 'Only the inspector who recorded this result can undo it',
      );
    }
    await this.prisma.slotInspection.delete({ where: { id } });
    await this.audit.record({
      userId: user.id,
      action: 'INSPECTION_UNDO',
      entity: 'slot_inspection',
      entityId: id,
      detail: { slotId: inspection.slotId, bookingId: inspection.bookingId },
    });
  }

  // ───────── จัดการผัง (ฝ่าย IT) ─────────

  async getLayout(): Promise<LayoutLot[]> {
    const lots = await this.prisma.parkingLot.findMany({
      where: { deletedAt: null },
      include: {
        slots: { where: { deletedAt: null }, orderBy: { code: 'asc' } },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return lots.map((lot) => ({
      id: lot.id,
      code: lot.code,
      name: lot.name,
      isOpen: lot.isOpen,
      slots: lot.slots.map((slot) => ({
        id: slot.id,
        code: slot.code,
        baseStatus: slot.baseStatus,
      })),
    }));
  }

  async createLot(user: AuthUser, dto: CreateLotDto): Promise<void> {
    const lot = await this.prisma.parkingLot.create({
      data: { code: dto.code.toUpperCase(), name: dto.name.trim() },
    });
    await this.recordLayoutChange(user, 'LOT_CREATE', 'parking_lot', lot.id);
  }

  async updateLot(
    user: AuthUser,
    id: number,
    dto: UpdateLotDto,
  ): Promise<void> {
    if (dto.isOpen === false)
      await this.assertNoUpcomingBookings({ lotId: id });
    await this.prisma.parkingLot.update({
      where: { id },
      data: { name: dto.name?.trim(), isOpen: dto.isOpen },
    });
    await this.recordLayoutChange(user, 'LOT_UPDATE', 'parking_lot', id);
  }

  async deleteLot(user: AuthUser, id: number): Promise<void> {
    await this.assertNoUpcomingBookings({ lotId: id });
    const deletedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.parkingSlot.updateMany({
        where: { lotId: id, deletedAt: null },
        data: { deletedAt },
      }),
      this.prisma.parkingLot.update({ where: { id }, data: { deletedAt } }),
    ]);
    await this.recordLayoutChange(user, 'LOT_DELETE', 'parking_lot', id);
  }

  async createSlot(user: AuthUser, dto: CreateSlotDto): Promise<void> {
    const slot = await this.prisma.parkingSlot.create({
      data: { lotId: dto.lotId, code: dto.code.toUpperCase() },
    });
    await this.recordLayoutChange(user, 'SLOT_CREATE', 'parking_slot', slot.id);
  }

  async updateSlotStatus(
    user: AuthUser,
    id: number,
    dto: UpdateSlotStatusDto,
  ): Promise<void> {
    const slot = await this.prisma.parkingSlot.findUniqueOrThrow({
      where: { id },
    });
    if (slot.baseStatus === dto.baseStatus) return;
    if (dto.baseStatus === 'CLOSED') {
      await this.assertNoUpcomingBookings({ slotId: id });
    }
    await this.prisma.$transaction([
      this.prisma.parkingSlot.update({
        where: { id },
        data: { baseStatus: dto.baseStatus },
      }),
      this.prisma.slotStatusLog.create({
        data: {
          slotId: id,
          fromStatus: slot.baseStatus,
          toStatus: dto.baseStatus,
          changedById: user.id,
          reason: dto.reason,
        },
      }),
    ]);
    await this.recordLayoutChange(user, 'SLOT_STATUS', 'parking_slot', id);
  }

  async deleteSlot(user: AuthUser, id: number): Promise<void> {
    await this.assertNoUpcomingBookings({ slotId: id });
    await this.prisma.parkingSlot.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.recordLayoutChange(user, 'SLOT_DELETE', 'parking_slot', id);
  }

  // ปิดหรือลบช่องที่ยังมีการจองค้างอยู่ไม่ได้ — ผู้จองชำระเงินไปแล้วและขอคืนไม่ได้ (ข้อ 6.3)
  private async assertNoUpcomingBookings(target: {
    slotId?: number;
    lotId?: number;
  }): Promise<void> {
    const upcoming = await this.prisma.slotOccupancy.count({
      where: {
        serviceDate: { gte: toDbDate(addDays(todayInBangkok(), -1)) },
        slot: target.slotId ? { id: target.slotId } : { lotId: target.lotId },
        booking: { status: { in: [...HOLDING_STATUSES] } },
      },
    });
    if (upcoming > 0) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'SLOT_HAS_BOOKINGS',
        'There are current or upcoming bookings on this slot',
      );
    }
  }

  private recordLayoutChange(
    user: AuthUser,
    action: string,
    entity: string,
    entityId: number,
  ): Promise<void> {
    return this.audit.record({ userId: user.id, action, entity, entityId });
  }
}
