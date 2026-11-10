import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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
import { customerName } from '../auth/domain/customer.js';
import { hasPermission } from '../auth/domain/permissions.js';
import {
  expandRounds,
  listRounds,
  MAX_ADVANCE_DAYS,
  roundsPerDay,
  usageWindow,
  validateBookingRequest,
  type BookingRequest,
} from '../booking/domain/rounds.js';
import { LayoutService } from '../layout/layout.service.js';
import { RoundsService } from '../rounds/rounds.service.js';
import { freeSlotCount, type Occupancy } from './domain/availability.js';
import { checkInspectionUndo } from './domain/inspection-undo.js';
import {
  checkLayout,
  parseStoredLayout,
  type LayoutProblem,
} from './domain/layout-input.js';
import { layoutOf } from './domain/lot-layouts.js';
import type { LotLayout } from './domain/lot-layout.js';
import { compareSlotLabels, slotLabel } from './domain/slot-label.js';
import {
  isBookableBy,
  resolveStatus,
  visibleStatus,
  type SlotBaseStatus,
  type SlotStatus,
  type SlotViewer,
} from './domain/slot-status.js';
import { usagePhase } from './domain/usage.js';
import { isConfirmed } from '../booking/domain/booking-status.js';
import type {
  CreateLotDto,
  CreateSlotDto,
  RecordInspectionDto,
  UpdateLotDto,
  UpdateLotLayoutDto,
  UpdateSlotStatusDto,
} from './dto/yard.dto.js';
import {
  ACTIVE_LOT,
  HOLDING_BOOKING,
  loadActiveSlots,
  loadBookingUsages,
  loadOccupancies,
  lotFromDb,
  controlInEffect,
  NOT_DELETED_SLOT,
} from './yard-store.js';

export type SlotView = {
  id: number;
  lot: string;
  code: string;
  status: SlotStatus;
  bookable: boolean;
};

// รายละเอียดการใช้งานของช่อง — ส่งให้เฉพาะพนักงาน ไม่ส่งให้ผู้ขอใช้บริการ
export type SlotUsage = {
  bookingId: string; // BookingNo
  bookingNo: string;
  customerId: string; // CusId
  customerName: string;
  serviceDate: string;
  startsAt: string;
  endsAt: string;
  // ชำระงวดแรกแล้ว — false = จองรอบนี้แล้วยังไม่ชำระ (ช่องยังถือไว้ระหว่างรอ QR แต่ผู้ตรวจต้องรู้ว่ายังไม่ควรให้เริ่มงาน)
  paid: boolean;
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

export type LayoutLot = LotInfo & {
  id: number;
  slots: {
    id: number;
    code: string;
    baseStatus: SlotBaseStatus;
  }[];
};

// ลานจอดสำหรับวาดผัง: ชื่อ และผังของลาน (null = เรียงช่องแถวละ 6 แบบตั้งต้น)
export type LotInfo = {
  code: string;
  name: string;
  isOpen: boolean;
  layout: LotLayout | null;
};

// ตารางช่อง × รอบของวันเดียว (แบบไฟล์ Excel ที่ฝ่ายบริการลูกค้าใช้อยู่): ใครใช้ช่องไหนรอบไหน
export type DayBoardCell = {
  bookingId: string;
  bookingNo: string;
  customerName: string;
  paid: boolean;
} | null;
export type DayBoard = {
  date: string;
  rounds: { index: number; label: string }[];
  slots: {
    id: number;
    lot: string;
    code: string;
    baseStatus: SlotBaseStatus;
    cells: DayBoardCell[]; // ตามลำดับรอบ
  }[];
};

// บล็อกการใช้งานของวันก่อนหน้ายังอาจค้างสถานะหมดเวลาอยู่ จึงย้อนดูการจองถึง 2 วันบริการ
const LIVE_LOOKBACK_DAYS = 2;

export function viewerOf(user: AuthUser): SlotViewer {
  if (hasPermission(user, 'SLOT_INSPECT')) return 'INSPECTOR';
  if (hasPermission(user, 'BOOKING_CREATE_ON_BEHALF'))
    return 'CUSTOMER_SERVICE';
  return user.type === 'EMPLOYEE' ? 'STAFF' : 'CUSTOMER';
}

function notFound(message: string): ApiException {
  return new ApiException(HttpStatus.NOT_FOUND, 'RECORD_NOT_FOUND', message);
}

// details = เลขช่องที่ซ้ำ (หน้าจัดผังเพิ่มได้หลายช่องพร้อมกัน จึงต้องบอกว่าช่องไหน)
function slotTaken(code: string): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    'SLOT_CODE_TAKEN',
    'This slot code already exists in the lot',
    [code],
  );
}

function layoutError(problem: LayoutProblem): ApiException {
  switch (problem.kind) {
    case 'UNKNOWN_SLOT':
      return new ApiException(
        HttpStatus.BAD_REQUEST,
        'LAYOUT_UNKNOWN_SLOT',
        'The layout has a slot the lot does not have',
        [problem.slot],
      );
    case 'DUPLICATE_SLOT':
      return new ApiException(
        HttpStatus.BAD_REQUEST,
        'LAYOUT_DUPLICATE_SLOT',
        'The layout places the same slot twice',
        [problem.slot],
      );
    case 'SLOT_TAKEN':
      return slotTaken(problem.slot);
    case 'INVALID':
      return new ApiException(
        HttpStatus.BAD_REQUEST,
        'LAYOUT_INVALID',
        'The layout is not in the expected shape',
      );
  }
}

@Injectable()
export class YardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rounds: RoundsService,
    private readonly layout: LayoutService,
  ) {}

  private async perDay(): Promise<(serviceDate: string) => number> {
    const scheduleFor = await this.rounds.resolver();
    return (serviceDate) => roundsPerDay(scheduleFor(serviceDate));
  }

  private async findLots() {
    const lots = await this.prisma.parking.findMany({
      where: ACTIVE_LOT,
      include: { extra: true },
    });
    return lots
      .map((parking) => {
        const lot = lotFromDb(parking);
        // ผังที่แอดมินบันทึกไว้ก่อน ไม่มีจึงใช้ผังตั้งต้นของลาน
        const saved = parseStoredLayout(parking.extra?.layout ?? null);
        return { ...lot, layout: saved ?? layoutOf(lot.code) };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  async getLots(): Promise<LotInfo[]> {
    return (await this.findLots()).map((lot) => ({
      code: lot.code,
      name: lot.name,
      isOpen: lot.isOpen,
      layout: lot.layout,
    }));
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
    const schedule = scheduleFor(request.startDate);
    const takenSlotIds = await this.findTakenSlotIds(request, schedule);
    const slots = await loadActiveSlots(this.prisma);

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

  async getDayBoard(date: string): Promise<DayBoard> {
    const schedule = (await this.rounds.resolver())(date);
    const rounds = listRounds(schedule);
    const [slots, details] = await Promise.all([
      loadActiveSlots(this.prisma),
      this.prisma.bookingDetail.findMany({
        where: { usageDate: toDbDate(date), booking: HOLDING_BOOKING },
        select: {
          bookingNo: true,
          round: { select: { roundSequence: true } },
          parkingSlotId: true,
          booking: {
            select: {
              bookingStatus: true,
              paymentStatus: true,
              bookingChannel: true,
              customer: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);
    const cellAt = new Map(
      details.map((row) => [
        `${row.parkingSlotId}:${row.round.roundSequence - 1}`,
        {
          bookingId: row.bookingNo,
          bookingNo: row.bookingNo,
          customerName: customerName(row.booking.customer),
          paid: isConfirmed(row.booking),
        },
      ]),
    );
    return {
      date,
      rounds,
      slots: slots.map((slot) => ({
        id: slot.id,
        lot: slot.lot.code,
        code: slot.code,
        baseStatus: slot.lot.isOpen ? slot.baseStatus : 'CLOSED',
        cells: rounds.map(
          (round) => cellAt.get(`${slot.id}:${round.index}`) ?? null,
        ),
      })),
    };
  }

  // สรุปความว่างของทุกรอบเริ่ม (ช่วงวันเดิม) และทุกวันที่จองล่วงหน้าได้ (รอบเดิม) — ดึงการจองครั้งเดียวแล้วนับในหน่วยความจำ
  async getAvailabilitySummary(
    user: AuthUser,
    request: BookingRequest,
    now: Date = new Date(),
  ): Promise<AvailabilitySummary> {
    const today = todayInBangkok(now);
    const viewer = viewerOf(user);
    const scheduleFor = await this.rounds.resolver();
    const slots = await loadActiveSlots(this.prisma);
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
      (_, index) => ({ ...request, startRound: index }),
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
        : await loadOccupancies(this.prisma, {
            from: dates[0],
            to: dates[dates.length - 1],
          });
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
    schedule: Parameters<typeof expandRounds>[1],
  ): Promise<Set<number>> {
    const keys = expandRounds(request, schedule);
    const wanted = new Set(
      keys.map((key) => `${key.serviceDate}:${key.roundIndex}`),
    );
    const dates = keys.map((key) => key.serviceDate).sort();
    // ดึงเป็นช่วงวันแล้วกรองในหน่วยความจำ เพราะการจองระยะยาวไม่จำกัดจำนวนวัน
    const occupancies = await loadOccupancies(
      this.prisma,
      { from: dates[0], to: dates[dates.length - 1] },
      { roundIndexes: [...new Set(keys.map((key) => key.roundIndex))] },
    );
    return new Set(
      occupancies
        .filter((row) => wanted.has(`${row.serviceDate}:${row.roundIndex}`))
        .map((row) => row.slotId),
    );
  }

  // สถานะ ณ เวลานี้ของทุกช่อง รวมช่องที่หมดเวลาแล้ว (ข้อ 4, 5)
  async getLive(user: AuthUser, now: Date = new Date()): Promise<LiveYard> {
    const viewer = viewerOf(user);
    const today = todayInBangkok(now);
    const since = addDays(today, -LIVE_LOOKBACK_DAYS);

    const [slots, bookings, vacated, scheduleFor] = await Promise.all([
      loadActiveSlots(this.prisma),
      loadBookingUsages(
        this.prisma,
        { from: since, to: today },
        await this.perDay(),
      ),
      this.prisma.slotInspection.findMany({
        where: { result: 'VACATED', usageDate: { gte: toDbDate(since) } },
        select: { parkingSlotId: true, bookingNo: true, usageDate: true },
      }),
      this.rounds.resolver(),
    ]);
    const vacatedKeys = new Set(
      vacated.map(
        (row) =>
          `${row.parkingSlotId}:${row.bookingNo}:${fromDbDate(row.usageDate)}`,
      ),
    );

    // ต่อช่อง: เก็บการใช้งานที่กำลังเกิดขึ้น และการใช้งานที่หมดเวลาล่าสุด
    const active = new Map<number, SlotUsage>();
    const overtime = new Map<number, SlotUsage>();
    for (const booking of bookings) {
      for (const serviceDate of booking.dates) {
        const window = usageWindow(
          serviceDate,
          booking.startRound,
          booking.roundCount,
          scheduleFor(serviceDate),
        );
        for (const slotId of booking.slotIds) {
          const isVacated = vacatedKeys.has(
            `${slotId}:${booking.bookingNo}:${serviceDate}`,
          );
          const phase = usagePhase(window, now, isVacated);
          const usage: SlotUsage = {
            bookingId: booking.bookingNo,
            bookingNo: booking.bookingNo,
            customerId: booking.customerId,
            customerName: booking.customerName,
            serviceDate,
            startsAt: window.startsAt.toISOString(),
            endsAt: window.endsAt.toISOString(),
            paid: booking.paid,
            fine: null,
          };
          if (phase === 'ACTIVE') active.set(slotId, usage);
          const latest = overtime.get(slotId);
          if (
            phase === 'OVERTIME' &&
            booking.paid &&
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
        detail: { parkingSlotId: { in: [...overtime.keys()] } },
        createdDate: { gte: new Date(earliestEnd) },
      },
      include: {
        payment: { select: { status: true } },
        detail: { select: { parkingSlotId: true } },
      },
      orderBy: { createdDate: 'desc' },
    });
    for (const [slotId, usage] of overtime) {
      const fine = fines.find(
        (item) =>
          Number(item.detail.parkingSlotId) === slotId &&
          item.cusId === usage.customerId &&
          item.createdDate.toISOString() >= usage.endsAt,
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

  // [เรา] ผลตรวจหน้างาน — คืน id ของผลตรวจ ให้หน้าจอเลิกทำได้ (ดู undoInspection)
  async recordInspection(
    user: AuthUser,
    dto: RecordInspectionDto,
  ): Promise<{ id: number }> {
    const used = await this.prisma.bookingDetail.count({
      where: {
        bookingNo: dto.bookingId,
        parkingSlotId: dto.slotId,
      },
    });
    if (used === 0) throw notFound('This booking does not use this slot');
    const inspection = await this.prisma.slotInspection.create({
      data: {
        parkingSlotId: dto.slotId,
        bookingNo: dto.bookingId,
        usageDate: toDbDate(dto.serviceDate),
        result: dto.result,
        inspectedBy: user.id,
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
    if (!inspection) throw notFound('Inspection not found');
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
      actor: user.id,
      action: 'INSPECTION_UNDO',
      entity: 'slot_inspection',
      entityId: id,
      detail: {
        slotId: Number(inspection.parkingSlotId),
        bookingNo: inspection.bookingNo,
      },
    });
  }

  // ───────── จัดการผัง (ฝ่าย IT) ─────────

  async getLayout(): Promise<LayoutLot[]> {
    const [lots, slots] = await Promise.all([
      this.findLots(),
      loadActiveSlots(this.prisma),
    ]);
    return lots.map((lot) => ({
      id: lot.id,
      code: lot.code,
      name: lot.name,
      isOpen: lot.isOpen,
      layout: lot.layout,
      slots: slots
        .filter((slot) => slot.lotId === lot.id)
        .sort((a, b) => compareSlotLabels(a.code, b.code))
        .map((slot) => ({
          id: slot.id,
          code: slot.code,
          baseStatus: slot.baseStatus,
        })),
    }));
  }

  async createLot(user: AuthUser, dto: CreateLotDto): Promise<void> {
    const code = dto.code.toUpperCase();
    const taken = await this.prisma.parkingExtra.findUnique({
      where: { code },
    });
    if (taken) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'LOT_CODE_TAKEN',
        'This lot code is already used',
      );
    }
    const lot = await this.prisma.$transaction(async (tx) => {
      const sortOrder = await tx.parkingExtra.count();
      const created = await tx.parking.create({
        data: {
          parkingName: dto.name.trim(),
          createdBy: user.id,
          extra: { create: { code, sortOrder } },
        },
      });
      await this.layout.createFirstVersion(tx, created.parkingId, user.id);
      return created;
    });
    await this.recordLayoutChange(user, 'LOT_CREATE', 'parking', lot.parkingId);
  }

  async updateLot(
    user: AuthUser,
    id: number,
    dto: UpdateLotDto,
  ): Promise<void> {
    if (dto.isOpen === false)
      await this.assertNoUpcomingBookings({ lotId: id });
    await this.prisma.parking.update({
      where: { parkingId: id },
      data: { parkingName: dto.name?.trim(), isActive: dto.isOpen },
    });
    await this.recordLayoutChange(user, 'LOT_UPDATE', 'parking', id);
  }

  // บันทึกผังที่แอดมินจัด (null = กลับไปใช้ผังตั้งต้น) พร้อมสร้างช่องใหม่ที่เพิ่มจากหน้าจัดผัง
  // ทั้งหมดอยู่ใน transaction เดียว: ช่องใหม่ไม่เกิดขึ้นถ้าผังบันทึกไม่ผ่าน — ผังแค่จัดตำแหน่ง ไม่กระทบการจองเดิม
  async updateLotLayout(
    user: AuthUser,
    id: number,
    dto: UpdateLotLayoutDto,
  ): Promise<void> {
    const [lot] = await this.prisma.parking.findMany({
      where: { parkingId: id, ...ACTIVE_LOT },
      select: { parkingId: true },
    });
    if (!lot) throw notFound('Lot not found');
    // ช่องใหม่และช่องที่ลบใช้ได้เฉพาะเมื่อมีผัง (กลับไปผังตั้งต้นไม่สร้าง/ไม่ลบช่อง)
    const newSlots =
      dto.layout === null
        ? []
        : (dto.newSlots ?? []).map((code) => code.toUpperCase());
    const deletedCodes = new Set(
      dto.layout === null
        ? []
        : (dto.deletedSlots ?? []).map((code) => code.toUpperCase()),
    );

    const { created, deleted } = await this.prisma.$transaction(async (tx) => {
      const slots = await loadActiveSlots(tx, { parkingId: id });
      // ลบช่องก่อน: ช่องที่ยังมีการจองค้างอยู่ลบไม่ได้ (ข้อ 6.3) — ทั้งผังไม่ถูกบันทึก บอกเลขช่องใน details
      const toDelete = slots.filter((slot) => deletedCodes.has(slot.code));
      for (const slot of toDelete) {
        await this.assertNoUpcomingBookings({ slotId: slot.id }, tx, slot.code);
        await tx.parkingSlot.update({
          where: { parkingSlotId: slot.id },
          data: { isActive: false },
        });
      }
      let text: string | null = null;
      if (dto.layout !== null) {
        // ช่องที่ลบแล้วต้องไม่อยู่ในผัง (ถ้าอยู่ = LAYOUT_UNKNOWN_SLOT)
        const result = checkLayout(
          dto.layout,
          slots
            .filter((slot) => !deletedCodes.has(slot.code))
            .map((slot) => slot.code),
          newSlots,
        );
        if (!result.ok) throw layoutError(result.problem);
        text = JSON.stringify(result.layout);
      }
      const slotIds: bigint[] = [];
      for (const code of newSlots)
        slotIds.push(await this.addSlot(tx, user, id, code));
      await tx.parkingExtra.update({
        where: { parkingId: id },
        data: { layout: text },
      });
      return { created: slotIds, deleted: toDelete.map((slot) => slot.id) };
    });

    for (const slotId of created)
      await this.recordLayoutChange(
        user,
        'SLOT_CREATE',
        'parking_slot',
        slotId,
      );
    for (const slotId of deleted)
      await this.recordLayoutChange(
        user,
        'SLOT_DELETE',
        'parking_slot',
        slotId,
      );
    await this.recordLayoutChange(user, 'LOT_LAYOUT_UPDATE', 'parking', id);
  }

  async deleteLot(user: AuthUser, id: number): Promise<void> {
    await this.assertNoUpcomingBookings({ lotId: id });
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const slots = await tx.parkingSlot.findMany({
        where: { parkingId: id, ...NOT_DELETED_SLOT },
        select: { parkingSlotId: true },
      });
      await tx.parkingSlot.updateMany({
        where: {
          parkingSlotId: { in: slots.map((slot) => slot.parkingSlotId) },
        },
        data: { isActive: false },
      });
      await tx.parkingExtra.update({
        where: { parkingId: id },
        data: { deletedAt },
      });
    });
    await this.recordLayoutChange(user, 'LOT_DELETE', 'parking', id);
  }

  async createSlot(user: AuthUser, dto: CreateSlotDto): Promise<void> {
    const slotId = await this.prisma.$transaction((tx) =>
      this.addSlot(tx, user, dto.lotId, dto.code.toUpperCase()),
    );
    await this.recordLayoutChange(user, 'SLOT_CREATE', 'parking_slot', slotId);
  }

  // เพิ่มช่องหนึ่งช่องใน transaction ของผู้เรียก (ปุ่มเพิ่มช่อง และช่องใหม่จากหน้าจัดผัง)
  private async addSlot(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    lotId: number,
    code: string,
  ): Promise<bigint> {
    const existing = await tx.parkingSlot.findUnique({
      where: { parkingId_slot: { parkingId: lotId, slot: code } },
    });
    // เพิ่มช่องที่เคยลบไปแล้วกลับมา: ใช้แถวเดิม (ParkingSlot มี unique ลาน + เลขช่อง)
    if (existing && !existing.isActive) {
      await tx.parkingSlot.update({
        where: { parkingSlotId: existing.parkingSlotId },
        data: { isActive: true },
      });
      return existing.parkingSlotId;
    }
    if (existing) throw slotTaken(code);
    const created = await tx.parkingSlot.create({
      data: { parkingId: lotId, slot: code, createdBy: user.id },
    });
    return created.parkingSlotId;
  }

  // ปิด / สงวนสิทธิ์ = ParkingSlotControl ของ SA: สิ้นสุดการควบคุมเดิม (ใส่ EndDateTime เก็บประวัติ) แล้วเริ่มอันใหม่
  // ตั้งกลับเป็นเปิด = แค่สิ้นสุดการควบคุมเดิม
  async updateSlotStatus(
    user: AuthUser,
    id: number,
    dto: UpdateSlotStatusDto,
  ): Promise<void> {
    const [slot] = await loadActiveSlots(this.prisma, { parkingSlotId: id });
    if (!slot) throw notFound('Slot not found');
    if (slot.baseStatus === dto.baseStatus) return;
    if (dto.baseStatus === 'CLOSED') {
      await this.assertNoUpcomingBookings({ slotId: id });
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.parkingSlotControl.updateMany({
        where: { parkingSlotId: id, ...controlInEffect(now) },
        data: { endDateTime: now },
      });
      if (dto.baseStatus !== 'OPEN') {
        await tx.parkingSlotControl.create({
          data: {
            parkingSlotId: id,
            slotStatusCode: dto.baseStatus,
            startDateTime: now,
            reason: dto.reason,
            createdBy: user.id,
          },
        });
      }
    });
    await this.audit.record({
      actor: user.id,
      action: 'SLOT_STATUS',
      entity: 'parking_slot',
      entityId: id,
      detail: {
        label: slotLabel(slot.lot.code, slot.code),
        from: slot.baseStatus,
        to: dto.baseStatus,
        ...(dto.reason ? { reason: dto.reason } : {}),
      },
    });
  }

  async deleteSlot(user: AuthUser, id: number): Promise<void> {
    await this.assertNoUpcomingBookings({ slotId: id });
    await this.prisma.parkingSlot.update({
      where: { parkingSlotId: id },
      data: { isActive: false },
    });
    await this.recordLayoutChange(user, 'SLOT_DELETE', 'parking_slot', id);
  }

  // ปิดหรือลบช่องที่ยังมีการจองค้างอยู่ไม่ได้ — ผู้จองชำระเงินไปแล้วและขอคืนไม่ได้ (ข้อ 6.3)
  // client = transaction ของผู้เรียก (ลบช่องพร้อมบันทึกผัง); slotCode = บอกใน details ว่าช่องไหนติดการจอง
  private async assertNoUpcomingBookings(
    target: { slotId?: number | bigint; lotId?: number },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
    slotCode?: string,
  ): Promise<void> {
    const upcoming = await client.bookingDetail.count({
      where: {
        usageDate: { gte: toDbDate(addDays(todayInBangkok(), -1)) },
        ...(target.slotId
          ? { parkingSlotId: target.slotId }
          : { slot: { parkingId: target.lotId } }),
        booking: HOLDING_BOOKING,
      },
    });
    if (upcoming > 0) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'SLOT_HAS_BOOKINGS',
        'There are current or upcoming bookings on this slot',
        slotCode ? [slotCode] : undefined,
      );
    }
  }

  // detail.label = ชื่อที่หน้าประวัติแสดงแทน ID ภายใน (ช่อง "P4-12", ลาน "อาคารจอด 4")
  // เก็บตอนบันทึก: ช่องหรือลานที่ถูกลบ/เปลี่ยนชื่อภายหลัง ประวัติยังบอกชื่อ ณ ตอนนั้น
  private async recordLayoutChange(
    user: AuthUser,
    action: string,
    entity: 'parking' | 'parking_slot',
    entityId: number | bigint,
  ): Promise<void> {
    const label = await this.auditLabel(entity, BigInt(entityId));
    await this.audit.record({
      actor: user.id,
      action,
      entity,
      entityId: entityId.toString(),
      ...(label ? { detail: { label } } : {}),
    });
  }

  // อ่านรวมช่องและลานที่ลบแล้ว (ลบแบบเก็บแถวไว้ — ParkingSlotExtra/ParkingExtra.DeletedAt)
  private async auditLabel(
    entity: 'parking' | 'parking_slot',
    id: bigint,
  ): Promise<string | null> {
    if (entity === 'parking') {
      const lot = await this.prisma.parking.findUnique({
        where: { parkingId: id },
        select: { parkingName: true },
      });
      return lot?.parkingName ?? null;
    }
    const slot = await this.prisma.parkingSlot.findUnique({
      where: { parkingSlotId: id },
      select: {
        slot: true,
        parking: { select: { extra: { select: { code: true } } } },
      },
    });
    if (!slot) return null;
    const lotCode = slot.parking.extra?.code;
    return lotCode ? slotLabel(lotCode, slot.slot) : slot.slot;
  }
}
