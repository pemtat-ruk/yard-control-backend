import type { Prisma } from '@prisma/client';
import { fromDbDate, toDbDate } from '../../common/service-date.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { customerName } from '../auth/domain/customer.js';
import {
  summarizeDetails,
  type BookingShape,
} from '../booking/domain/booking-details.js';
import { isConfirmed } from '../booking/domain/booking-status.js';
import { compareSlotLabels } from './domain/slot-label.js';
import type { SlotBaseStatus } from './domain/slot-status.js';

type Client = PrismaService | Prisma.TransactionClient;

// การจองที่ถือช่องจอดอยู่ (BookingStatus A = ปกติ รวมที่รอชำระเงิน)
export const HOLDING_BOOKING = { bookingStatus: 'A' } as const;

export type LotRow = {
  id: number;
  code: string;
  name: string;
  isOpen: boolean;
  sortOrder: number;
};

export type SlotRow = {
  id: number; // ParkingSlotID
  lotId: number;
  lot: LotRow;
  code: string; // ParkingSlot.Slot
  baseStatus: SlotBaseStatus;
};

// ช่องที่ไม่ถูกลบ (ลบช่อง = ParkingSlot.Is_Active 0 เก็บแถวไว้ให้การจองเก่าอ้างถึง)
export const NOT_DELETED_SLOT = { isActive: true };

// สถานะที่ตั้งด้วยมือซึ่งมีผลตอนนี้ (ParkingSlotControl): เริ่มแล้ว และยังไม่สิ้นสุด
export function controlInEffect(
  now: Date,
): Prisma.ParkingSlotControlWhereInput {
  return {
    isActive: true,
    startDateTime: { lte: now },
    OR: [{ endDateTime: null }, { endDateTime: { gt: now } }],
  };
}
export const ACTIVE_LOT = { extra: { deletedAt: null } };

export function lotFromDb(parking: {
  parkingId: bigint;
  parkingName: string;
  isActive: boolean;
  extra: { code: string; sortOrder: number } | null;
}): LotRow {
  return {
    id: Number(parking.parkingId),
    code: parking.extra?.code ?? String(parking.parkingId),
    name: parking.parkingName,
    isOpen: parking.isActive,
    sortOrder: parking.extra?.sortOrder ?? 0,
  };
}

// สถานะตั้งต้นของช่อง = การควบคุมสถานะล่าสุดที่มีผลอยู่ (ParkingSlotControl) ไม่มี = เปิด
export function slotFromDb(
  slot: {
    parkingSlotId: bigint;
    parkingId: bigint;
    slot: string;
    controls: { slotStatusCode: string }[];
  },
  lot: LotRow,
): SlotRow {
  const code = slot.controls[0]?.slotStatusCode;
  const baseStatus: SlotBaseStatus =
    code === 'CLOSED' ? 'CLOSED' : code === 'RESERVED' ? 'RESERVED' : 'OPEN';
  return {
    id: Number(slot.parkingSlotId),
    lotId: Number(slot.parkingId),
    lot,
    code: slot.slot,
    baseStatus,
  };
}

// เรียงตามลาน แล้วเลขช่องแบบตัวเลข (2 ก่อน 10) — ฐานข้อมูลเรียงรหัสแบบตัวอักษร จึงเรียงต่อในหน่วยความจำ
export async function loadActiveSlots(
  prisma: Client,
  where: Prisma.ParkingSlotWhereInput = {},
): Promise<SlotRow[]> {
  const slots = await prisma.parkingSlot.findMany({
    where: { ...where, ...NOT_DELETED_SLOT, parking: ACTIVE_LOT },
    // ไม่ดึงผัง (Layout) ของลานมากับทุกช่อง
    include: {
      parking: {
        include: { extra: { select: { code: true, sortOrder: true } } },
      },
      controls: {
        where: controlInEffect(new Date()),
        orderBy: { startDateTime: 'desc' },
        take: 1,
        select: { slotStatusCode: true },
      },
    },
  });
  return slots
    .map((slot) => slotFromDb(slot, lotFromDb(slot.parking)))
    .sort(
      (a, b) =>
        a.lot.sortOrder - b.lot.sortOrder ||
        a.lotId - b.lotId ||
        compareSlotLabels(a.code, b.code),
    );
}

export type OccupancyRow = {
  slotId: number;
  serviceDate: string;
  roundIndex: number;
  bookingNo: string;
};

// ช่อง × วัน × รอบที่การจองที่ยังถืออยู่ใช้ (BookingDetail) ในช่วงวัน
export async function loadOccupancies(
  prisma: Client,
  range: { from: string; to: string },
  filter: {
    roundIndexes?: number[];
    slotIds?: number[];
    bookingNo?: { not: string };
  } = {},
): Promise<OccupancyRow[]> {
  const rows = await prisma.bookingDetail.findMany({
    where: {
      usageDate: { gte: toDbDate(range.from), lte: toDbDate(range.to) },
      booking: HOLDING_BOOKING,
      ...(filter.bookingNo ? { bookingNo: filter.bookingNo } : {}),
      ...(filter.roundIndexes
        ? {
            round: {
              roundSequence: { in: filter.roundIndexes.map((i) => i + 1) },
            },
          }
        : {}),
      ...(filter.slotIds ? { parkingSlotId: { in: filter.slotIds } } : {}),
    },
    select: {
      bookingNo: true,
      usageDate: true,
      round: { select: { roundSequence: true } },
      parkingSlotId: true,
    },
  });
  return rows.map((row) => ({
    slotId: Number(row.parkingSlotId),
    serviceDate: fromDbDate(row.usageDate),
    roundIndex: row.round.roundSequence - 1,
    bookingNo: row.bookingNo,
  }));
}

export type BookingUsage = {
  bookingNo: string;
  customerId: string; // CusId
  customerName: string;
  // ชำระงวดแรกแล้ว (การจองที่ยังไม่ชำระไม่นับเป็นการจอดเกินเวลา)
  paid: boolean;
} & BookingShape;

// การจองที่ยังถืออยู่และมีวันใช้งานในช่วง — สรุปเป็นวัน รอบ และช่อง (เฉพาะวันในช่วง)
export async function loadBookingUsages(
  prisma: Client,
  range: { from: string; to: string },
  roundsPerDay: (serviceDate: string) => number,
  where: Prisma.BookingHeaderWhereInput = {},
): Promise<BookingUsage[]> {
  const rows = await prisma.bookingDetail.findMany({
    where: {
      usageDate: { gte: toDbDate(range.from), lte: toDbDate(range.to) },
      booking: { ...HOLDING_BOOKING, ...where },
    },
    select: {
      bookingNo: true,
      usageDate: true,
      round: { select: { roundSequence: true } },
      parkingSlotId: true,
      booking: {
        select: {
          bookingCusId: true,
          bookingStatus: true,
          paymentStatus: true,
          bookingChannel: true,
          customer: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  const byBooking = new Map<string, typeof rows>();
  for (const row of rows) {
    byBooking.set(row.bookingNo, [
      ...(byBooking.get(row.bookingNo) ?? []),
      row,
    ]);
  }
  return [...byBooking.entries()].map(([bookingNo, details]) => {
    const { booking } = details[0];
    const firstDate = details
      .map((detail) => fromDbDate(detail.usageDate))
      .sort()[0];
    return {
      bookingNo,
      customerId: booking.bookingCusId,
      customerName: customerName(booking.customer),
      paid: isConfirmed(booking),
      ...summarizeDetails(
        details.map((detail) => ({
          serviceDate: fromDbDate(detail.usageDate),
          roundIndex: detail.round.roundSequence - 1,
          slotId: Number(detail.parkingSlotId),
        })),
        roundsPerDay(firstDate),
      ),
    };
  });
}
