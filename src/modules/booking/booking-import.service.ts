import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../../common/api-exception.js';
import { nextDocumentNo } from '../../common/document-no.js';
import { loadPeople } from '../../common/people.js';
import {
  bangkokInstant,
  toDbDate,
  todayInBangkok,
} from '../../common/service-date.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { labelOf, parseSlotLabel } from '../yard/domain/slot-label.js';
import { AuditService, parseAuditDetail } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { customerName } from '../auth/domain/customer.js';
import { LayoutService } from '../layout/layout.service.js';
import { isBookableBy, resolveStatus } from '../yard/domain/slot-status.js';
import {
  loadActiveSlots,
  loadOccupancies,
  type SlotRow,
} from '../yard/yard-store.js';
import { BOOKING_INCLUDE, toBookingView } from './booking-record.js';
import { BookingService } from './booking.service.js';
import { parseImportFile, type ImportRow } from './domain/import-file.js';
import {
  BOOKING_ACTIVE,
  BOOKING_TYPE_CODE,
  CHANNEL_IMPORT,
  PAY_WAITING,
  PAYMENT_TYPE_CODE,
  type BookingStatus,
} from './domain/booking-status.js';
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
  id: string;
  bookingNo: string;
  customerName: string;
  slots: string[];
  startDate: string;
  endDate: string;
  status: BookingStatus;
};

const IMPORT_HISTORY_LIMIT = 50;

type CheckedRow = ImportRowView & {
  customerId: string | null;
  slotRows: SlotRow[];
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
    private readonly layout: LayoutService,
    private readonly audit: AuditService,
    private readonly rounds: RoundsService,
    private readonly bookings: BookingService,
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

    const catalog = await this.layout.catalog();
    const bookingNos = await this.prisma.$transaction(async (tx) => {
      // ล็อกแถวช่องทั้งหมดในไฟล์ (เรียงตามรหัส) แล้วตรวจซ้อนอีกครั้งก่อนบันทึก
      const slotIds = [...new Set(rows.flatMap((row) => row.slotIds))].sort(
        (a, b) => a - b,
      );
      for (const slotId of slotIds) {
        await tx.$queryRaw`SELECT ParkingSlotID FROM ParkingSlot WITH (UPDLOCK, ROWLOCK) WHERE ParkingSlotID = ${slotId}`;
      }
      if (await this.anyTaken(tx, rows)) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'BOOKING_SLOT_TAKEN',
          'One or more slots were just booked by someone else',
        );
      }
      const created: string[] = [];
      for (const row of rows) {
        const dates = serviceDates(row.request);
        const bookingNo = await nextDocumentNo(tx, 'BK', user.id, now);
        await tx.bookingHeader.create({
          data: {
            bookingNo,
            bookingDate: now,
            bookingCusId: row.customerId as string,
            bookingChannel: CHANNEL_IMPORT,
            bookingType: BOOKING_TYPE_CODE.LONG,
            paymentType: PAYMENT_TYPE_CODE.DAILY,
            paymentStatus: PAY_WAITING,
            bookingStatus: BOOKING_ACTIVE,
            totalAmount: row.totalAmount,
            createdBy: user.id,
            createdDate: now,
          },
        });
        await tx.bookingDetail.createMany({
          data: expandRounds(row.request, row.schedule).flatMap((key) =>
            row.slotRows.map((slot) => {
              const roundId = catalog.roundIdOf(
                key.serviceDate,
                key.roundIndex,
              );
              if (roundId === null) {
                throw new ApiException(
                  HttpStatus.UNPROCESSABLE_ENTITY,
                  'BOOKING_SLOT_NOT_BOOKABLE',
                  'One or more slots have no layout or rounds on these dates',
                );
              }
              return {
                bookingNo,
                usageDate: toDbDate(key.serviceDate),
                parkingSlotId: BigInt(slot.id),
                roundId,
                amount: row.price,
              };
            }),
          ),
        });
        await this.bookings.createSchedules(tx, {
          bookingNo,
          dates,
          dailyAmount: row.totalAmount / dates.length,
          // เที่ยงคืนก่อนวันใช้งาน
          dueAt: (date) => bangkokInstant(date, 0),
          payNowDates: [],
          paymentId: null,
          actor: user.id,
        });
        created.push(bookingNo);
      }
      return created;
    });

    await this.audit.record({
      actor: user.id,
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
  // [รอ] ImportFile / ImportDetailLog ยังไม่มีคอลัมน์ — อ่านจาก AuditLog ของการนำเข้าไปก่อน
  async history(): Promise<ImportHistoryItem[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: { action: 'BOOKING_IMPORT' },
      orderBy: { id: 'desc' },
      take: IMPORT_HISTORY_LIMIT,
    });
    const people = await loadPeople(
      this.prisma,
      logs.map((log) => log.actorCode),
    );
    return logs.map((log) => {
      const detail = parseImportDetail(parseAuditDetail(log.detail));
      return {
        id: log.id,
        importedAt: log.createdDate.toISOString(),
        importedBy: log.actorCode
          ? (people.get(log.actorCode)?.name ?? log.actorCode)
          : null,
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
    const { bookingNos } = parseImportDetail(parseAuditDetail(log.detail));
    const bookings = await this.prisma.bookingHeader.findMany({
      where: { bookingNo: { in: bookingNos } },
      include: BOOKING_INCLUDE,
      orderBy: { bookingNo: 'asc' },
    });
    const now = new Date();
    const scheduleFor = await this.rounds.resolver();
    return bookings.map((booking) => {
      const view = toBookingView(
        booking,
        now,
        todayInBangkok(now),
        scheduleFor,
      );
      return {
        id: view.id,
        bookingNo: view.bookingNo,
        customerName: view.customerName,
        slots: view.slots,
        startDate: view.startDate,
        endDate: view.endDate,
        status: view.status as BookingStatus,
      };
    });
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
      [...customers.values()].map((customer) => customer.cusId),
    );

    const catalog = await this.layout.catalog();
    const scheduleFor = (date: string) => catalog.scheduleFor(date);
    const rows: CheckedRow[] = [];
    for (const row of parsed.rows) {
      const errors: string[] = [...row.errors];
      // เวลาเริ่มในไฟล์ → เลขรอบตามตารางรอบของวันเริ่ม (ตารางรอบเปลี่ยนได้แบบมีผลตั้งแต่วันที่)
      const shapeOk = row.errors.length === 0;
      const schedule = scheduleFor(row.startDate);
      const startRound = listRounds(schedule).findIndex(
        (round) =>
          round.label.startsWith(row.startTime) ||
          round.label.startsWith(row.startTime.replace(/:00$/, ':01')),
      );
      if (shapeOk && startRound < 0) errors.push('IMPORT_TIME_INVALID');
      const customer = customerOf(row, customers);
      if (!customer && !errors.includes('IMPORT_CUSTOMER_MISSING')) {
        errors.push('IMPORT_CUSTOMER_NOT_FOUND');
      }
      if (customer && withFine.has(customer.cusId)) {
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
      const price = shapeOk ? catalog.priceFor(row.startDate) : 0;
      rows.push({
        line: row.line,
        customerName: customer ? customerName(customer) : null,
        customerId: customer?.cusId ?? null,
        slots: row.slotCodes,
        slotRows: rowSlots.flatMap((slot) => (slot ? [slot.row] : [])),
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

  // ช่อง × วัน × รอบของแถว (รวมรอบที่ล้นข้ามเที่ยงคืน — นับเป็นวันถัดไป)
  private keysOf(row: CheckedRow): string[] {
    return expandRounds(row.request, row.schedule).flatMap((key) =>
      row.slotIds.map((slotId) =>
        occupancyKey(slotId, key.serviceDate, key.roundIndex),
      ),
    );
  }

  private async takenKeys(
    client: Parameters<typeof loadOccupancies>[0],
    rows: CheckedRow[],
  ): Promise<Set<string>> {
    const dates = rows
      .flatMap((row) =>
        expandRounds(row.request, row.schedule).map((key) => key.serviceDate),
      )
      .sort();
    if (dates.length === 0) return new Set();
    const existing = await loadOccupancies(
      client,
      { from: dates[0], to: dates[dates.length - 1] },
      { slotIds: [...new Set(rows.flatMap((row) => row.slotIds))] },
    );
    return new Set(
      existing.map((row) =>
        occupancyKey(row.slotId, row.serviceDate, row.roundIndex),
      ),
    );
  }

  private async anyTaken(
    client: Parameters<typeof loadOccupancies>[0],
    rows: CheckedRow[],
  ): Promise<boolean> {
    const taken = await this.takenKeys(client, rows);
    return rows.some((row) => this.keysOf(row).some((key) => taken.has(key)));
  }

  // ช่องที่มีคนจองไว้แล้ว และช่องที่แถวก่อนหน้าในไฟล์เดียวกันจองไปแล้ว
  private async markTakenSlots(rows: CheckedRow[]): Promise<void> {
    const ready = rows.filter((row) => row.errors.length === 0);
    if (ready.length === 0) return;
    const taken = await this.takenKeys(this.prisma, ready);
    const claimed = new Set<string>();
    for (const row of ready) {
      const keys = this.keysOf(row);
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
    const customers = await this.prisma.cRMCustomer.findMany({
      where: {
        isActive: true,
        OR: [
          {
            laborCode: {
              in: rows.map((row) => row.laborCardNo).filter(Boolean),
            },
          },
          {
            telephone: { in: rows.map((row) => row.phone).filter(Boolean) },
          },
        ],
      },
      select: {
        cusId: true,
        firstName: true,
        lastName: true,
        telephone: true,
        laborCode: true,
      },
    });
    const byKey = new Map<string, (typeof customers)[number]>();
    for (const customer of customers) {
      if (customer.laborCode) byKey.set(`card:${customer.laborCode}`, customer);
      if (customer.telephone) {
        byKey.set(`phone:${customer.telephone}`, customer);
      }
    }
    return byKey;
  }

  // ช่องในไฟล์เป็นรหัสเต็ม "P5-12" (เลขช่องซ้ำกันข้ามลาน) — ไม่ระบุลานถือว่าไม่พบ
  private async findSlots(rows: ImportRow[]) {
    const wanted = [...new Set(rows.flatMap((row) => row.slotCodes))]
      .map(parseSlotLabel)
      .filter((label) => label !== null);
    const slots =
      wanted.length === 0
        ? []
        : await loadActiveSlots(this.prisma, {
            OR: wanted.map((label) => ({
              slot: label.code,
              parking: { extra: { code: label.lot } },
            })),
          });
    return new Map(
      slots.map((slot) => [
        labelOf(slot),
        {
          id: slot.id,
          row: slot,
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

  private async customersWithUnpaidFine(ids: string[]): Promise<Set<string>> {
    const fines = await this.prisma.fine.findMany({
      where: { cusId: { in: ids }, NOT: { payment: { status: 'PAID' } } },
      select: { cusId: true },
    });
    return new Set(
      fines.flatMap((fine) => (fine.cusId === null ? [] : [fine.cusId])),
    );
  }
}

function customerOf(
  row: ImportRow,
  customers: Map<
    string,
    { cusId: string; firstName: string | null; lastName: string | null }
  >,
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
