import { addDays, diffDays } from '../../../common/service-date.js';

// BookingDetail เก็บ 1 แถวต่อช่อง × วันใช้งาน × รอบ (รอบที่ล้นข้ามวันอยู่ในวันถัดไป)
// ส่วนอื่นของระบบคิดเป็น "วันบริการที่จอง + ช่วงรอบเดียวกันทุกวัน" จึงสรุปกลับเป็นรูปนั้น
export type DetailKey = {
  serviceDate: string;
  roundIndex: number;
  slotId: number;
};

export type BookingShape = {
  dates: string[]; // วันบริการที่จองจริง เรียงจากเก่าไปใหม่
  startRound: number;
  roundCount: number;
  slotIds: number[];
};

const EPOCH = '2000-01-01';

// ทุกวันบริการใช้ช่วงรอบเดียวกัน: รอบเริ่ม = รอบแรกสุด, จำนวนรอบ = ความยาวช่วงต่อเนื่องแรก (ไม่เกินจำนวนรอบต่อวัน)
// วันบริการ = วันที่มีรอบเริ่มของช่วงนั้น
export function summarizeDetails(
  details: DetailKey[],
  roundsPerDay: number,
): BookingShape {
  const slotIds = [...new Set(details.map((d) => d.slotId))].sort(
    (a, b) => a - b,
  );
  if (details.length === 0) {
    return { dates: [], startRound: 0, roundCount: 0, slotIds };
  }
  const oneSlot = details.filter((d) => d.slotId === slotIds[0]);
  const absolute = [
    ...new Set(
      oneSlot.map(
        (d) => diffDays(EPOCH, d.serviceDate) * roundsPerDay + d.roundIndex,
      ),
    ),
  ].sort((a, b) => a - b);
  const first = absolute[0];
  const taken = new Set(absolute);
  let roundCount = 0;
  while (roundCount < roundsPerDay && taken.has(first + roundCount)) {
    roundCount += 1;
  }
  const dates = absolute
    .filter((index) => (index - first) % roundsPerDay === 0)
    .map((index) => addDays(EPOCH, Math.floor(index / roundsPerDay)));
  return {
    dates,
    startRound: first % roundsPerDay,
    roundCount,
    slotIds,
  };
}
