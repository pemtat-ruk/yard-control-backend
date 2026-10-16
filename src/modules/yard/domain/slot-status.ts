// ข้อ 5: สถานะช่องจอด และสถานะที่ผู้ใช้แต่ละกลุ่มมองเห็น
export type SlotStatus =
  'AVAILABLE' | 'OCCUPIED' | 'OVERTIME' | 'RESERVED' | 'CLOSED';

export type SlotViewer =
  'CUSTOMER' | 'INSPECTOR' | 'CUSTOMER_SERVICE' | 'STAFF';

export type SlotBaseStatus = 'OPEN' | 'RESERVED' | 'CLOSED';

export type SlotFacts = {
  baseStatus: SlotBaseStatus; // สถานะที่ตั้งด้วยมือ
  lotOpen: boolean;
  occupied: boolean; // มีการจองในช่วงเวลาที่ดู
  overtime: boolean; // หมดเวลาแล้วแต่ยังไม่ยืนยันว่ารถออก
};

// สถานะจริงของช่องจอด: ปิดใช้งานมาก่อน ตามด้วยการใช้งานจริง แล้วจึงเป็นสถานะที่ตั้งไว้
export function resolveStatus(facts: SlotFacts): SlotStatus {
  if (!facts.lotOpen || facts.baseStatus === 'CLOSED') return 'CLOSED';
  if (facts.occupied) return 'OCCUPIED';
  if (facts.overtime) return 'OVERTIME';
  return facts.baseStatus === 'RESERVED' ? 'RESERVED' : 'AVAILABLE';
}

// ผู้ขอใช้บริการเห็นช่องหมดเวลาเป็นช่องว่าง และเห็นช่องสงวนสิทธิ์เป็นช่องปิด
// API ต้องส่งสถานะที่ผ่าน function นี้แล้วเท่านั้น เพื่อไม่ให้ข้อมูลภายในหลุดถึงลูกค้า
export function visibleStatus(
  status: SlotStatus,
  viewer: SlotViewer,
): SlotStatus {
  if (viewer === 'CUSTOMER') {
    if (status === 'OVERTIME') return 'AVAILABLE';
    if (status === 'RESERVED') return 'CLOSED';
  }
  return status;
}

export function isBookableBy(status: SlotStatus, viewer: SlotViewer): boolean {
  if (visibleStatus(status, viewer) === 'AVAILABLE') return true;
  // ฝ่ายบริการลูกค้าจองช่องสงวนสิทธิ์ให้ลูกค้าประจำได้
  return status === 'RESERVED' && viewer === 'CUSTOMER_SERVICE';
}
