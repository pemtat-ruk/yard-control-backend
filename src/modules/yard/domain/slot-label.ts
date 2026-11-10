// รหัสช่องแบบบอกลาน เช่น "P5-12" — ลานจริงใช้เลขช่องซ้ำกัน (ทุกลานมีช่อง 1)
// ทุกที่ที่แสดงช่องนอกผังของลาน (ตั๋ว ใบเสร็จ รายการจอง ค่าปรับ แจ้งเตือน รายงาน ไฟล์นำเข้า) จึงใช้รหัสนี้
const SEPARATOR = '-';

export function slotLabel(lotCode: string, slotCode: string): string {
  return `${lotCode}${SEPARATOR}${slotCode}`;
}

export type SlotWithLot = { code: string; lot: { code: string } };

export function labelOf(slot: SlotWithLot): string {
  return slotLabel(slot.lot.code, slot.code);
}

// รหัสลานไม่มีขีด (ตรวจใน DTO) จึงตัดที่ขีดแรก: "PR-14/7" → ลาน "PR" ช่อง "14/7"
export function parseSlotLabel(
  label: string,
): { lot: string; code: string } | null {
  const at = label.indexOf(SEPARATOR);
  if (at <= 0 || at === label.length - 1) return null;
  return { lot: label.slice(0, at), code: label.slice(at + 1) };
}

// เรียงแบบตัวเลข: P5-2 มาก่อน P5-10
export function compareSlotLabels(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

export function sortedLabels(slots: SlotWithLot[]): string[] {
  return slots.map(labelOf).sort(compareSlotLabels);
}

// select ของ Prisma (ParkingSlot) ที่ได้ข้อมูลพอสร้างรหัสเต็ม — รหัสลานอยู่ใน ParkingExtra
export const SLOT_WITH_LOT = {
  slot: true,
  parking: { select: { extra: { select: { code: true } } } },
} as const;

export type DbSlotWithLot = {
  slot: string;
  parking: { extra: { code: string } | null };
};

export function dbSlotLabel(slot: DbSlotWithLot): string {
  return slotLabel(slot.parking.extra?.code ?? '', slot.slot);
}

export function sortedDbLabels(slots: DbSlotWithLot[]): string[] {
  return [...new Set(slots.map(dbSlotLabel))].sort(compareSlotLabels);
}
