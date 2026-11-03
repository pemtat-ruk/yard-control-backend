import { addDays, todayInBangkok } from '../../../common/service-date.js';
import {
  expandRounds,
  firstOpenRound,
  roundsPerDay,
  type BookingRequest,
  type RoundSchedule,
} from '../../booking/domain/rounds.js';

// ช่องที่ถูกถือไว้ในรอบใดรอบหนึ่งของวันบริการ (จาก slot_occupancies)
export type Occupancy = {
  slotId: number;
  serviceDate: string;
  roundIndex: number;
};

// ช่องที่กันไว้บางรอบของทุกวัน (เช่น โลจิสติกส์ 23:01–11:00): คำขอที่ทับรอบใดรอบหนึ่งในนั้นจองช่องนี้ไม่ได้
export function heldDuring(
  heldRounds: number[],
  request: BookingRequest,
  schedule: RoundSchedule,
): boolean {
  if (heldRounds.length === 0) return false;
  const held = new Set(heldRounds);
  return expandRounds(request, schedule).some((key) =>
    held.has(key.roundIndex),
  );
}

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

// รอบที่กำลังดำเนินอยู่ตอนนี้ (ลำดับในวันบริการ) — ก่อน 07:01 ยังเป็นรอบท้ายของวันบริการเมื่อวาน
export function currentRoundIndex(
  now: Date,
  scheduleFor: (serviceDate: string) => RoundSchedule,
): number {
  const today = todayInBangkok(now);
  const yesterday = addDays(today, -1);
  const lateRound = firstOpenRound(yesterday, now, scheduleFor(yesterday));
  return lateRound < roundsPerDay(scheduleFor(yesterday))
    ? lateRound
    : firstOpenRound(today, now, scheduleFor(today));
}
