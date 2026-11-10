import { toDbDate } from '../../common/service-date.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { CONFIRMED_BOOKING } from './domain/booking-status.js';
import { roundAfterUsage, type RoundSchedule } from './domain/rounds.js';

export type UsageOfDay = {
  customerId: string; // CusId
  slotIds: number[];
  serviceDate: string;
  startRound: number;
  roundCount: number;
  // ตารางรอบของวันบริการนั้น
  schedule: RoundSchedule;
};

// Workflow ข้อ 5: "ช่องจอดเดิมมีรอบจองต่อเนื่อง" = ผู้จองคนเดิมจองทุกช่องของรายการนี้ไว้ในรอบถัดไปทันที (ชำระแล้ว)
// ใช้ทั้งงานแจ้งเตือนตามเวลา และตารางการจองของผู้ขอใช้บริการ
export async function continuesInNextRound(
  prisma: PrismaService,
  usage: UsageOfDay,
): Promise<boolean> {
  const next = roundAfterUsage(
    usage.serviceDate,
    usage.startRound,
    usage.roundCount,
    usage.schedule,
  );
  const continued = await prisma.bookingDetail.findMany({
    where: {
      parkingSlotId: { in: usage.slotIds },
      usageDate: toDbDate(next.serviceDate),
      round: { roundSequence: next.roundIndex + 1 },
      booking: { bookingCusId: usage.customerId, ...CONFIRMED_BOOKING },
    },
    select: { parkingSlotId: true },
  });
  const covered = new Set(continued.map((row) => Number(row.parkingSlotId)));
  return usage.slotIds.every((slotId) => covered.has(slotId));
}
