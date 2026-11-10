import {
  expandRounds,
  type BookingRequest,
  type RoundSchedule,
} from '../../booking/domain/rounds.js';

// ช่องที่ถูกถือไว้ในรอบใดรอบหนึ่งของวันบริการ (จาก slot_occupancies)
export type Occupancy = {
  slotId: number;
  serviceDate: string;
  roundIndex: number;
};

// จำนวนช่องที่ยังจองได้ตลอดทุกรอบของคำขอ: ช่องที่เปิดให้ผู้ดูคนนี้จอง ลบช่องที่ถูกถือไว้ในรอบใดรอบหนึ่งของคำขอ
// ใช้สรุปความว่างให้ปุ่มวันและปุ่มรอบในหน้าจอง — ไม่ใช่การตรวจตอนจองจริง (ตอนจองตรวจซ้ำด้วย unique constraint)
export function freeSlotCount(
  bookableSlotIds: number[],
  occupancies: Occupancy[],
  request: BookingRequest,
  schedule: RoundSchedule,
): number {
  const wanted = new Set(
    expandRounds(request, schedule).map(
      (key) => `${key.serviceDate}:${key.roundIndex}`,
    ),
  );
  const taken = new Set(
    occupancies
      .filter((row) => wanted.has(`${row.serviceDate}:${row.roundIndex}`))
      .map((row) => row.slotId),
  );
  return bookableSlotIds.filter((id) => !taken.has(id)).length;
}
