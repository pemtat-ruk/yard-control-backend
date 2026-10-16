const MINUTES_PER_HOUR = 60;

// [ถาม ข้อ 6] สูตรสมมุติจนกว่าเจ้าของงานกำหนดอัตราจริง:
// ค่าปรับ = จำนวนรอบที่จอดเกิน (ตามชั่วโมงต่อรอบของการจอง เกินไม่ถึงรอบนับเป็น 1 รอบ) × ราคาต่อช่องต่อรอบของการจอง × ตัวคูณค่าปรับ
export type OvertimeFine = {
  overtimeMinutes: number;
  rounds: number;
  pricePerSlotRound: number;
  multiplier: number;
  amount: number;
};

export function overtimeFine(input: {
  overtimeMinutes: number;
  pricePerSlotRound: number;
  multiplier: number;
  roundHours: number;
}): OvertimeFine {
  const overtimeMinutes = Math.max(0, Math.floor(input.overtimeMinutes));
  const rounds = Math.max(
    1,
    Math.ceil(overtimeMinutes / (input.roundHours * MINUTES_PER_HOUR)),
  );
  return {
    overtimeMinutes,
    rounds,
    pricePerSlotRound: input.pricePerSlotRound,
    multiplier: input.multiplier,
    amount: rounds * input.pricePerSlotRound * input.multiplier,
  };
}

// เวลาที่จอดเกินของช่องหนึ่ง ณ ตอนนี้: นับจากการใช้งานที่หมดล่าสุด
// ยังอยู่ในช่วงที่จองไว้ (รวมจองรอบต่อไว้แล้ว) = ไม่เกินเวลา ปรับไม่ได้ (คืน null)
export function overtimeMinutesAt(
  windows: { startsAt: Date; endsAt: Date }[],
  now: Date,
): number | null {
  const time = now.getTime();
  if (
    windows.some(
      (window) =>
        window.startsAt.getTime() <= time && time < window.endsAt.getTime(),
    )
  ) {
    return null;
  }
  const ended = windows
    .map((window) => window.endsAt.getTime())
    .filter((end) => end <= time);
  if (ended.length === 0) return null;
  return (time - Math.max(...ended)) / (MINUTES_PER_HOUR * 1000);
}
