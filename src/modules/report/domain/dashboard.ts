const MS = 1;

// ช่วงก่อนหน้าที่ยาวเท่ากันและต่อกันพอดี ใช้คำนวณ "เทียบกับช่วงก่อน" บนแดชบอร์ด
// เช่น 1–30 เม.ย. → 2–31 มี.ค. (ความยาวเท่ากัน สิ้นสุดก่อนวันเริ่ม 1 ms)
export function previousRange(from: Date, to: Date): { from: Date; to: Date } {
  const length = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime() - MS);
  return { from: new Date(previousTo.getTime() - length), to: previousTo };
}

export type LotShareInput = { lots: string[]; paidAmount: number };
export type LotSummary = {
  lot: string;
  slots: number;
  bookings: number;
  paidAmount: number;
};

// สรุปตามลาน: จำนวนช่องที่จอง จำนวนการจองที่ใช้ลานนั้น และยอดชำระ
// การจองเดียวอาจมีช่องหลายลาน ยอดชำระจึงแบ่งตามสัดส่วนจำนวนช่องในแต่ละลาน (ปัดเป็นบาทตอนท้าย)
export function summarizeLots(bookings: LotShareInput[]): LotSummary[] {
  const lots = new Map<
    string,
    { slots: number; bookings: number; paid: number }
  >();
  for (const booking of bookings) {
    if (booking.lots.length === 0) continue;
    const share = booking.paidAmount / booking.lots.length;
    for (const lot of new Set(booking.lots)) {
      const entry = lots.get(lot) ?? { slots: 0, bookings: 0, paid: 0 };
      const slotsInLot = booking.lots.filter((code) => code === lot).length;
      entry.slots += slotsInLot;
      entry.bookings += 1;
      entry.paid += share * slotsInLot;
      lots.set(lot, entry);
    }
  }
  return [...lots.entries()]
    .map(([lot, entry]) => ({
      lot,
      slots: entry.slots,
      bookings: entry.bookings,
      paidAmount: Math.round(entry.paid),
    }))
    .sort((a, b) => a.lot.localeCompare(b.lot));
}
