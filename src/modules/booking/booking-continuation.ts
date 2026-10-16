import { toDbDate } from '../../common/service-date.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { roundAfterUsage, type RoundSchedule } from './domain/rounds.js';

export type UsageOfDay = {
  customerId: number;
  slotIds: number[];
  serviceDate: string;
  startRound: number;
  roundCount: number;
  // ตารางรอบของการจอง (ตามวันแรกของการจอง)
  schedule: RoundSchedule;
};

// Workflow ข้อ 5: "ช่องจอดเดิมมีรอบจองต่อเนื่อง" = ผู้จองคนเดิมจองทุกช่องของรายการนี้ไว้ในรอบถัดไปทันที
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
  const continued = await prisma.slotOccupancy.count({
    where: {
      slotId: { in: usage.slotIds },
      serviceDate: toDbDate(next.serviceDate),
      roundIndex: next.roundIndex,
      booking: {
        customerId: usage.customerId,
        status: { in: ['CONFIRMED', 'COMPLETED'] },
      },
    },
  });
  return continued === usage.slotIds.length;
}
