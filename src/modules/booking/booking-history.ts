import type { Prisma } from '@prisma/client';

// ประวัติการจอง (Data Dictionary พ.ย. 2569: BookingHeaderHistory / BookingDetailHistory / PaymentScheduleHistory)
// เรียกใน transaction เดียวกับการแก้ไข "ก่อน" แก้ — เก็บสภาพเดิมของใบจอง รายการย่อย และงวดชำระทั้งชุด
// HistoryGroupID นับต่อใบจอง: ครั้งแรก 1 ครั้งถัดไปเลขล่าสุด + 1 (unique BookingNo + HistoryGroupID กันเลขซ้ำ)
// ใบจองที่ไม่มีอยู่จริง: ไม่บันทึก (คืน null)
export async function snapshotBooking(
  tx: Prisma.TransactionClient,
  bookingNo: string,
): Promise<number | null> {
  const header = await tx.bookingHeader.findUnique({
    where: { bookingNo },
    include: { details: true, schedules: true },
  });
  if (!header) return null;

  const last = await tx.bookingHeaderHistory.aggregate({
    where: { bookingNo },
    _max: { historyGroupId: true },
  });
  const historyGroupId = (last._max.historyGroupId ?? 0) + 1;
  const { details, schedules, ...fields } = header;

  await tx.bookingHeaderHistory.create({
    data: { ...fields, historyGroupId },
  });
  if (details.length > 0) {
    await tx.bookingDetailHistory.createMany({
      data: details.map((detail) => ({ ...detail, historyGroupId })),
    });
  }
  if (schedules.length > 0) {
    await tx.paymentScheduleHistory.createMany({
      data: schedules.map((schedule) => ({ ...schedule, historyGroupId })),
    });
  }
  return historyGroupId;
}
