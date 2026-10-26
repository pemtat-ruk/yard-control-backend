import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type BookingStatus } from '@prisma/client';
import { ApiException } from '../../common/api-exception.js';
import {
  bangkokInstant,
  fromDbDate,
  toDbDate,
  todayInBangkok,
} from '../../common/service-date.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PricingService } from '../pricing/pricing.service.js';
import { isBookableBy, resolveStatus } from '../yard/domain/slot-status.js';
import { bookingNoFor, tempBookingNo } from './booking-number.js';
import { CUSTOMER_TYPES } from './booking.service.js';
import { parseImportFile, type ImportRow } from './domain/import-file.js';
import { parseImportDetail } from './domain/import-history.js';
import {
  classifyBooking,
  expandRounds,
  listRounds,
  roundLabel,
  serviceDates,
  validateBookingRequest,
  type BookingRequest,
  type RoundSchedule,
} from './domain/rounds.js';
import { RoundsService } from '../rounds/rounds.service.js';

// ผลตรวจหนึ่งแถว: ผ่านแล้วนำเข้าได้ ไม่ผ่านบอกเหตุผลเป็น code (หน้าเว็บแปลเป็นข้อความ)
export type ImportRowView = {
  line: number;
  customerName: string | null;
  slots: string[];
  startDate: string;
  endDate: string;
  roundLabel: string;
  roundCount: number;
  days: number;
  totalAmount: number;
  errors: string[];
};

export type ImportPreview = {
  rows: ImportRowView[];
  validCount: number;
  totalAmount: number;
};

export type ImportResult = { bookingNos: string[] };

export type ImportHistoryItem = {
  id: number;
  importedAt: string;
  importedBy: string | null;
  fileName: string | null; // การนำเข้าก่อนมีการเก็บชื่อไฟล์ = null
  count: number;
  bookingNos: string[];
};

// Screen Design หน้า 14 "ดูรายละเอียด": การจองที่สร้างจากไฟล์หนึ่ง พร้อมสถานะปัจจุบัน
export type ImportedBooking = {
  id: number;
  bookingNo: string;
  customerName: string;
  slots: string[];
  startDate: string;
  endDate: string;
  status: BookingStatus;
};

const IMPORT_HISTORY_LIMIT = 50;

type CheckedRow = ImportRowView & {
  customerId: number | null;
  slotIds: number[];
  request: BookingRequest;
  price: number;
  schedule: RoundSchedule;
};

const occupancyKey = (slotId: number, date: string, round: number) =>
  `${slotId}:${date}:${round}`;

// ข้อ 2: ฝ่ายบริการลูกค้านำเข้าการจองระยะยาวของลูกค้าประจำ
// รายการที่นำเข้าชำระแบบวันต่อวัน: แต่ละวันชำระภายในเที่ยงคืนก่อนวันใช้งาน (ข้อ 6.1)
// ไม่มียอดที่ต้องชำระทันที — ลูกค้าจ่ายรายวันจากหน้ารายการจองของตนเอง วันที่ไม่จ่ายตามกำหนดถูกยกเลิกทั้งรายการ
@Injectable()
export class BookingImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
    private readonly rounds: RoundsService,
  ) {}

  async preview(csv: string, now: Date = new Date()): Promise<ImportPreview> {
    const rows = await this.check(csv, now);
    return summarize(rows);
  }

  // ทั้งไฟล์ต้องผ่านทุกแถว แล้วบันทึกใน transaction เดียว (ไม่มีการนำเข้าครึ่งไฟล์)
  async commit(
    user: AuthUser,
    csv: string,
    fileName: string | undefined,
    now: Date = new Date(),
  ): Promise<ImportResult> {
    const rows = await this.check(csv, now);
    if (rows.some((row) => row.errors.length > 0)) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'BOOKING_IMPORT_INVALID',
        'Some rows cannot be imported; check the preview',
      );
    }

    let bookingNos: string[];
    try {
      bookingNos = await this.prisma.$transaction(async (tx) => {
        const created: string[] = [];
        for (const row of rows) {
          const dates = serviceDates(row.request);
          const booking = await tx.booking.create({
            data: {
              bookingNo: tempBookingNo(),
              customerId: row.customerId as number,
              createdById: user.id,
              source: 'IMPORT',
              status: 'CONFIRMED',
              type: 'LONG',
              paymentPlan: 'DAILY',
              startDate: toDbDate(row.startDate),
              endDate: toDbDate(row.endDate),
              startRound: row.request.startRound,
              roundCount: row.roundCount,
              pricePerSlotRound: row.price,
              totalAmount: row.totalAmount,
              slots: { create: row.slotIds.map((slotId) => ({ slotId })) },
            },
          });
          const bookingNo = bookingNoFor(booking.id, now);
          await tx.booking.update({
            where: { id: booking.id },
            data: { bookingNo },
          });
          await tx.slotOccupancy.createMany({
            data: expandRounds(row.request, row.schedule).flatMap((key) =>
              row.slotIds.map((slotId) => ({
                slotId,
                bookingId: booking.id,
                serviceDate: toDbDate(key.serviceDate),
                roundIndex: key.roundIndex,
              })),
            ),
          });
          await tx.bookingDay.createMany({
            data: dates.map((date) => ({
              bookingId: booking.id,
              serviceDate: toDbDate(date),
              amount: row.totalAmount / dates.length,
              // เที่ยงคืนก่อนวันใช้งาน
              dueAt: bangkokInstant(date, 0),
            })),
          });
          created.push(bookingNo);
        }
        return created;
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

    await this.audit.record({
      userId: user.id,
      action: 'BOOKING_IMPORT',
      entity: 'booking',
      detail: {
        count: bookingNos.length,
        bookingNos,
        fileName: fileName?.trim() || null,
      },
    });
    return { bookingNos };
  }

  // Screen Design "รายการที่นำเข้า": ไฟล์ที่นำเข้าแล้ว ใคร เมื่อไร กี่รายการ และเลขที่การจองที่สร้าง
  // อ่านจาก audit log ของการนำเข้า (บันทึกทุกครั้งที่นำเข้าสำเร็จ) จึงไม่ต้องมีตารางเพิ่ม
  async history(): Promise<ImportHistoryItem[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: { action: 'BOOKING_IMPORT' },
      include: { user: { select: { fullName: true } } },
      orderBy: { id: 'desc' },
      take: IMPORT_HISTORY_LIMIT,
    });
    return logs.map((log) => {
      const detail = parseImportDetail(log.detail);
      return {
        id: log.id,
        importedAt: log.createdAt.toISOString(),
        importedBy: log.user?.fullName ?? null,
        fileName: detail.fileName,
        count: detail.bookingNos.length,
        bookingNos: detail.bookingNos,
      };
    });
  }

  async historyDetail(id: number): Promise<ImportedBooking[]> {
    const log = await this.prisma.auditLog.findFirst({
      where: { id, action: 'BOOKING_IMPORT' },
    });
    if (!log) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'RECORD_NOT_FOUND',
        'Import not found',
      );
    }
    const { bookingNos } = parseImportDetail(log.detail);
    const bookings = await this.prisma.booking.findMany({
      where: { bookingNo: { in: bookingNos } },
      include: {
        customer: { select: { fullName: true } },
        slots: { select: { slot: { select: { code: true } } } },
      },
      orderBy: { id: 'asc' },
    });
    return bookings.map((booking) => ({
      id: booking.id,
      bookingNo: booking.bookingNo,
      customerName: booking.customer.fullName,
      slots: booking.slots.map((item) => item.slot.code).sort(),
      startDate: fromDbDate(booking.startDate),
      endDate: fromDbDate(booking.endDate),
      status: booking.status,
    }));
  }

  private async check(csv: string, now: Date): Promise<CheckedRow[]> {
    const parsed = parseImportFile(csv);
    if (!parsed.ok) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        parsed.error,
        parsed.error === 'IMPORT_HEADER_INVALID'
          ? 'The first line must be the template header'
          : 'The file has too many rows',
      );
    }
    const today = todayInBangkok(now);
    const [customers, slots] = await Promise.all([
      this.findCustomers(parsed.rows),
      this.findSlots(parsed.rows),
    ]);
    const withFine = await this.customersWithUnpaidFine(
      [...customers.values()].map((customer) => customer.id),
    );

    const scheduleFor = await this.rounds.resolver();
    const rows: CheckedRow[] = [];
    for (const row of parsed.rows) {
      const errors: string[] = [...row.errors];
      // เวลาเริ่มในไฟล์ → เลขรอบตามตารางรอบของวันเริ่ม (ตารางรอบเปลี่ยนได้แบบมีผลตั้งแต่วันที่)
      const shapeOk = row.errors.length === 0;
      const schedule = scheduleFor(row.startDate);
      const startRound = listRounds(schedule).findIndex((round) =>
        round.label.startsWith(row.startTime),
      );
      if (shapeOk && startRound < 0) errors.push('IMPORT_TIME_INVALID');
      const customer = customerOf(row, customers);
      if (!customer && !errors.includes('IMPORT_CUSTOMER_MISSING')) {
        errors.push('IMPORT_CUSTOMER_NOT_FOUND');
      }
      if (customer && withFine.has(customer.id)) {
        errors.push('BOOKING_UNPAID_FINE');
      }
      const rowSlots = row.slotCodes.map((code) => slots.get(code));
      if (rowSlots.some((slot) => slot === undefined)) {
        errors.push('IMPORT_SLOT_NOT_FOUND');
      } else if (rowSlots.some((slot) => !slot?.bookable)) {
        errors.push('BOOKING_SLOT_NOT_BOOKABLE');
      }

      const request: BookingRequest = {
        startDate: row.startDate,
        endDate: row.endDate,
        startRound: Math.max(startRound, 0),
        roundCount: row.roundCount,
        skipDates: row.skipDates,
      };
      if (shapeOk && startRound >= 0) {
        errors.push(
          ...validateBookingRequest(request, today, scheduleFor, now),
        );
        if (classifyBooking(request) !== 'LONG') {
          errors.push('IMPORT_NOT_LONG_TERM');
        }
        // วันแรกต้องชำระภายในเที่ยงคืนก่อนวันนั้น — วันนี้ผ่านเที่ยงคืนมาแล้ว
        if (row.startDate <= today) errors.push('IMPORT_START_NOT_FUTURE');
      }
      const dates = shapeOk ? serviceDates(request) : [];
      const price = shapeOk ? await this.pricing.priceFor(row.startDate) : 0;
      rows.push({
        line: row.line,
        customerName: customer?.fullName ?? null,
        customerId: customer?.id ?? null,
        slots: row.slotCodes,
        slotIds: rowSlots.flatMap((slot) => (slot ? [slot.id] : [])),
        startDate: row.startDate,
        endDate: row.endDate,
        roundLabel:
          shapeOk && startRound >= 0 ? roundLabel(startRound, schedule) : '',
        roundCount: row.roundCount,
        days: dates.length,
        totalAmount:
          dates.length * row.slotCodes.length * row.roundCount * price,
        errors: [...new Set(errors)],
        request,
        price,
        schedule,
      });
    }
    await this.markTakenSlots(rows);
    return rows;
  }

  // ช่องที่มีคนจองไว้แล้ว และช่องที่แถวก่อนหน้าในไฟล์เดียวกันจองไปแล้ว
  private async markTakenSlots(rows: CheckedRow[]): Promise<void> {
    const ready = rows.filter((row) => row.errors.length === 0);
    if (ready.length === 0) return;
    const roundsOf = new Map(
      ready.map(
        (row) => [row, expandRounds(row.request, row.schedule)] as const,
      ),
    );
    const keysOf = (row: CheckedRow) =>
      (roundsOf.get(row) ?? []).flatMap((key) =>
        row.slotIds.map((slotId) =>
          occupancyKey(slotId, key.serviceDate, key.roundIndex),
        ),
      );
    // รวมวันของรอบที่ล้นข้ามเที่ยงคืน (นับเป็นวันบริการถัดไป)
    const dates = [...roundsOf.values()]
      .flatMap((keys) => keys.map((key) => key.serviceDate))
      .sort();
    const existing = await this.prisma.slotOccupancy.findMany({
      where: {
        slotId: { in: [...new Set(ready.flatMap((row) => row.slotIds))] },
        serviceDate: {
          gte: toDbDate(dates[0]),
          lte: toDbDate(dates[dates.length - 1]),
        },
      },
      select: { slotId: true, serviceDate: true, roundIndex: true },
    });
    const taken = new Set(
      existing.map((row) =>
        occupancyKey(row.slotId, fromDbDate(row.serviceDate), row.roundIndex),
      ),
    );
    const claimed = new Set<string>();
    for (const row of ready) {
      const keys = keysOf(row);
      if (keys.some((key) => taken.has(key))) {
        row.errors.push('BOOKING_SLOT_TAKEN');
      } else if (keys.some((key) => claimed.has(key))) {
        row.errors.push('IMPORT_SLOT_TAKEN_IN_FILE');
      } else {
        keys.forEach((key) => claimed.add(key));
      }
    }
  }

  // ผู้ขอใช้บริการที่ลงทะเบียนแล้ว: ค้นด้วยหมายเลขบัตรแรงงาน (เสื้อเขียว) หรือเบอร์โทร (ผู้ซื้อ)
  private async findCustomers(rows: ImportRow[]) {
    const users = await this.prisma.user.findMany({
      where: {
        type: { in: CUSTOMER_TYPES },
        isActive: true,
        OR: [
          {
            laborCardNo: {
              in: rows.map((row) => row.laborCardNo).filter(Boolean),
            },
          },
          { phone: { in: rows.map((row) => row.phone).filter(Boolean) } },
        ],
      },
      select: { id: true, fullName: true, phone: true, laborCardNo: true },
    });
    const byKey = new Map<string, (typeof users)[number]>();
    for (const user of users) {
      if (user.laborCardNo) byKey.set(`card:${user.laborCardNo}`, user);
      if (user.phone) byKey.set(`phone:${user.phone}`, user);
    }
    return byKey;
  }

  private async findSlots(rows: ImportRow[]) {
    const slots = await this.prisma.parkingSlot.findMany({
      where: {
        code: { in: [...new Set(rows.flatMap((row) => row.slotCodes))] },
        deletedAt: null,
        lot: { deletedAt: null },
      },
      include: { lot: { select: { isOpen: true } } },
    });
    return new Map(
      slots.map((slot) => [
        slot.code,
        {
          id: slot.id,
          // ฝ่ายบริการลูกค้าจองช่องสงวนสิทธิ์ให้ลูกค้าประจำได้ (ข้อ 5)
          bookable: isBookableBy(
            resolveStatus({
              baseStatus: slot.baseStatus,
              lotOpen: slot.lot.isOpen,
              occupied: false,
              overtime: false,
            }),
            'CUSTOMER_SERVICE',
          ),
        },
      ]),
    );
  }

  private async customersWithUnpaidFine(ids: number[]): Promise<Set<number>> {
    const fines = await this.prisma.fine.findMany({
      where: { customerId: { in: ids }, NOT: { payment: { status: 'PAID' } } },
      select: { customerId: true },
    });
    return new Set(
      fines.flatMap((fine) =>
        fine.customerId === null ? [] : [fine.customerId],
      ),
    );
  }
}

function customerOf(
  row: ImportRow,
  customers: Map<string, { id: number; fullName: string }>,
) {
  return row.laborCardNo
    ? customers.get(`card:${row.laborCardNo}`)
    : customers.get(`phone:${row.phone}`);
}

function summarize(rows: CheckedRow[]): ImportPreview {
  const valid = rows.filter((row) => row.errors.length === 0);
  return {
    rows: rows.map((row) => ({
      line: row.line,
      customerName: row.customerName,
      slots: row.slots,
      startDate: row.startDate,
      endDate: row.endDate,
      roundLabel: row.roundLabel,
      roundCount: row.roundCount,
      days: row.days,
      totalAmount: row.totalAmount,
      errors: row.errors,
    })),
    validCount: valid.length,
    totalAmount: valid.reduce((sum, row) => sum + row.totalAmount, 0),
  };
}
