import {
  addDays,
  bangkokInstant,
  dateRange,
  diffDays,
} from '../../../common/service-date.js';

// ข้อ 3.2: รอบเริ่ม 07:00 แบ่งรอบละ 4 ชม. จองขั้นต่ำ 1 รอบ — ค่าตั้งต้น ฝ่าย IT ตั้งใหม่ได้แบบมีผลตั้งแต่วันที่ (round_configs)
// วันบริการหนึ่งวันใช้ตารางรอบเดียว เริ่มที่ firstHour ยาว 24 ชม.
export type RoundSchedule = { firstHour: number; roundHours: number };
export const DEFAULT_SCHEDULE: RoundSchedule = { firstHour: 7, roundHours: 4 };
const HOURS_PER_DAY = 24;
// ชั่วโมงต่อรอบที่ตั้งได้: หาร 24 ลงตัว ทุกวันจึงมีจำนวนรอบเต็ม
export const ALLOWED_ROUND_HOURS = [2, 3, 4, 6, 8, 12];
// ข้อ 3.1: จองล่วงหน้าก่อนวันใช้งานได้ 7 วัน
export const MAX_ADVANCE_DAYS = 7;

export function roundsPerDay(schedule: RoundSchedule): number {
  return HOURS_PER_DAY / schedule.roundHours;
}

// ตารางรอบที่มีผล ณ วันบริการ: รายการล่าสุดที่วันมีผลไม่เกินวันนั้น (ไม่มี = ค่าตั้งต้น)
export function scheduleOn(
  configs: ({ effectiveFrom: string } & RoundSchedule)[],
  serviceDate: string,
): RoundSchedule {
  const config = configs
    .filter((item) => item.effectiveFrom <= serviceDate)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return config
    ? { firstHour: config.firstHour, roundHours: config.roundHours }
    : DEFAULT_SCHEDULE;
}

export type BookingType = 'SHORT' | 'LONG';

export type BookingRequest = {
  startDate: string; // วันบริการ (นับจาก 07:00 ถึง 07:00 วันถัดไป)
  endDate: string;
  startRound: number; // 0 = 07:00, 1 = 11:00, ... 5 = 03:00
  roundCount: number;
  // วันในช่วงที่ไม่ต้องการจอง (จองข้ามวันในรายการเดียว) — ต้องอยู่ระหว่างวันแรกกับวันสุดท้ายเท่านั้น
  skipDates?: string[];
};

export type BookingRuleError =
  | 'START_ROUND_INVALID'
  | 'ROUND_COUNT_INVALID'
  | 'END_BEFORE_START'
  | 'START_IN_PAST'
  | 'ROUND_ALREADY_ENDED'
  | 'START_TOO_FAR_AHEAD'
  | 'SKIP_DATE_INVALID'
  // ช่วงจองคร่อมวันที่ตารางรอบเปลี่ยน (รอบของวันก่อนกับวันหลังไม่ต่อกัน)
  | 'ROUND_SCHEDULE_CHANGES';

export type RoundKey = { serviceDate: string; roundIndex: number };

export function roundWindow(
  serviceDate: string,
  roundIndex: number,
  schedule: RoundSchedule,
): { startsAt: Date; endsAt: Date } {
  const startHour = schedule.firstHour + roundIndex * schedule.roundHours;
  return {
    startsAt: bangkokInstant(serviceDate, startHour),
    endsAt: bangkokInstant(serviceDate, startHour + schedule.roundHours),
  };
}

// ช่วงเวลาใช้ช่องจอดของหนึ่งวันบริการ: เริ่มที่รอบแรกที่จอง ยาวต่อเนื่องตามจำนวนรอบ
export function usageWindow(
  serviceDate: string,
  startRound: number,
  roundCount: number,
  schedule: RoundSchedule,
): { startsAt: Date; endsAt: Date } {
  const startHour = schedule.firstHour + startRound * schedule.roundHours;
  return {
    startsAt: bangkokInstant(serviceDate, startHour),
    endsAt: bangkokInstant(
      serviceDate,
      startHour + roundCount * schedule.roundHours,
    ),
  };
}

// รอบที่ต่อจากช่วงใช้งานของวันบริการนั้นทันที — ใช้ตรวจว่ามีการจองรอบต่อเนื่องหรือไม่
// เลยรอบสุดท้ายของวัน = รอบแรกของวันบริการถัดไป
export function roundAfterUsage(
  serviceDate: string,
  startRound: number,
  roundCount: number,
  schedule: RoundSchedule,
): RoundKey {
  const index = startRound + roundCount;
  const perDay = roundsPerDay(schedule);
  return {
    serviceDate: addDays(serviceDate, Math.floor(index / perDay)),
    roundIndex: index % perDay,
  };
}

export function roundLabel(
  roundIndex: number,
  schedule: RoundSchedule,
): string {
  const fmt = (hour: number) =>
    `${String(hour % HOURS_PER_DAY).padStart(2, '0')}:00`;
  const start = schedule.firstHour + roundIndex * schedule.roundHours;
  return `${fmt(start)}-${fmt(start + schedule.roundHours)}`;
}

export function listRounds(
  schedule: RoundSchedule,
): { index: number; label: string }[] {
  return Array.from({ length: roundsPerDay(schedule) }, (_, index) => ({
    index,
    label: roundLabel(index, schedule),
  }));
}

// รอบแรกของวันบริการที่ยังจองได้ ณ เวลานี้ (รอบที่จบไปแล้วจองไม่ได้)
// คืนจำนวนรอบต่อวันเมื่อทุกรอบของวันนั้นจบแล้ว
export function firstOpenRound(
  serviceDate: string,
  now: Date,
  schedule: RoundSchedule,
): number {
  const perDay = roundsPerDay(schedule);
  for (let index = 0; index < perDay; index++) {
    if (
      roundWindow(serviceDate, index, schedule).endsAt.getTime() > now.getTime()
    ) {
      return index;
    }
  }
  return perDay;
}

// วันบริการที่จองจริง: ทุกวันจากวันแรกถึงวันสุดท้าย ยกเว้นวันที่ขอข้าม
export function serviceDates(request: BookingRequest): string[] {
  const skipped = new Set(request.skipDates ?? []);
  return dateRange(request.startDate, request.endDate).filter(
    (date) => !skipped.has(date),
  );
}

// ระยะสั้น = รวมไม่เกิน 1 วัน, ระยะยาว = มากกว่า 1 วัน (นับเฉพาะวันที่จองจริง)
export function classifyBooking(request: BookingRequest): BookingType {
  return serviceDates(request).length > 1 ? 'LONG' : 'SHORT';
}

// now: ส่งมาเมื่อต้องกันการจองช่วงเวลาของวันนี้ที่จบไปแล้ว
// scheduleFor: ตารางรอบของแต่ละวันบริการ — การจองหนึ่งรายการใช้ตารางของวันแรกตลอด จึงห้ามคร่อมวันที่ตารางเปลี่ยน
export function validateBookingRequest(
  request: BookingRequest,
  today: string,
  scheduleFor: (serviceDate: string) => RoundSchedule,
  now?: Date,
): BookingRuleError[] {
  const errors: BookingRuleError[] = [];
  const { startDate, endDate, startRound, roundCount } = request;
  const schedule = scheduleFor(startDate);
  const ROUNDS_PER_DAY = roundsPerDay(schedule);

  if (
    !Number.isInteger(startRound) ||
    startRound < 0 ||
    startRound >= ROUNDS_PER_DAY
  ) {
    errors.push('START_ROUND_INVALID');
  }
  if (
    !Number.isInteger(roundCount) ||
    roundCount < 1 ||
    roundCount > ROUNDS_PER_DAY
  ) {
    errors.push('ROUND_COUNT_INVALID');
  }
  if (diffDays(startDate, endDate) < 0) {
    errors.push('END_BEFORE_START');
  }
  // วันแรกและวันสุดท้ายต้องจองเสมอ จึงข้ามได้เฉพาะวันที่อยู่ระหว่างกลาง
  const skipDates = request.skipDates ?? [];
  if (skipDates.some((date) => !(date > startDate && date < endDate))) {
    errors.push('SKIP_DATE_INVALID');
  }
  const advance = diffDays(today, startDate);
  if (advance < 0) {
    errors.push('START_IN_PAST');
  } else if (advance > MAX_ADVANCE_DAYS) {
    errors.push('START_TOO_FAR_AHEAD');
  }
  if (errors.length === 0 && now) {
    const { endsAt } = usageWindow(startDate, startRound, roundCount, schedule);
    if (endsAt.getTime() <= now.getTime()) {
      errors.push('ROUND_ALREADY_ENDED');
    }
  }
  if (errors.length === 0 && crossesScheduleChange(request, scheduleFor)) {
    errors.push('ROUND_SCHEDULE_CHANGES');
  }
  return errors;
}

const sameSchedule = (a: RoundSchedule, b: RoundSchedule) =>
  a.firstHour === b.firstHour && a.roundHours === b.roundHours;

// คร่อมวันที่ตารางรอบเปลี่ยน: วันในช่วงจอง (รวมวันถัดจากวันสุดท้าย ที่รอบล้นข้ามเที่ยงคืนไปถึง) ใช้ตารางต่างจากวันแรก
// และช่วงใช้งานของวันสุดท้ายต้องจบก่อนวันบริการถัดไปเริ่ม (เมื่อวันถัดไปเริ่มเร็วขึ้น ช่วงจะทับกัน)
function crossesScheduleChange(
  request: BookingRequest,
  scheduleFor: (serviceDate: string) => RoundSchedule,
): boolean {
  const schedule = scheduleFor(request.startDate);
  const dates = dateRange(request.startDate, request.endDate);
  if (dates.some((date) => !sameSchedule(scheduleFor(date), schedule))) {
    return true;
  }
  const nextDay = addDays(request.endDate, 1);
  const nextSchedule = scheduleFor(nextDay);
  if (sameSchedule(nextSchedule, schedule)) return false;
  const { endsAt } = usageWindow(
    request.endDate,
    request.startRound,
    request.roundCount,
    schedule,
  );
  return (
    endsAt.getTime() > bangkokInstant(nextDay, nextSchedule.firstHour).getTime()
  );
}

// แตกคำขอจองเป็นรายรอบ; ระยะยาวใช้ช่วงเวลาเดียวกับวันแรกทุกวันที่จอง (ไม่รวมวันที่ข้าม)
// รอบที่ล้นเกินรอบสุดท้ายของวันจะนับเป็นรอบแรกๆ ของวันบริการถัดไป
export function expandRounds(
  request: BookingRequest,
  schedule: RoundSchedule,
): RoundKey[] {
  const perDay = roundsPerDay(schedule);
  const keys: RoundKey[] = [];
  for (const date of serviceDates(request)) {
    for (let i = 0; i < request.roundCount; i++) {
      const index = request.startRound + i;
      keys.push({
        serviceDate: addDays(date, Math.floor(index / perDay)),
        roundIndex: index % perDay,
      });
    }
  }
  return keys;
}

// วันที่จองไว้ (จากตาราง booking_days) ที่อยู่ในช่วงที่สนใจ — ใช้แทนการไล่ทุกวันจากวันแรกถึงวันสุดท้าย
// เพราะการจองอาจข้ามบางวัน
export function bookedDatesWithin(
  bookedDates: string[],
  from: string,
  to: string,
): string[] {
  return bookedDates.filter((date) => date >= from && date <= to).sort();
}
