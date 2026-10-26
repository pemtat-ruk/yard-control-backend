// detail ของ audit log การนำเข้าเป็น JSON อิสระ (เก่าไม่มีชื่อไฟล์) — ตรวจรูปที่ขอบก่อนใช้ ค่าที่ผิดรูปถือว่าไม่มี
export function parseImportDetail(detail: unknown): {
  fileName: string | null;
  bookingNos: string[];
} {
  const record: Record<string, unknown> =
    detail !== null && typeof detail === 'object' && !Array.isArray(detail)
      ? (detail as Record<string, unknown>)
      : {};
  const bookingNos = Array.isArray(record.bookingNos)
    ? record.bookingNos.filter((no): no is string => typeof no === 'string')
    : [];
  const fileName =
    typeof record.fileName === 'string' && record.fileName.trim() !== ''
      ? record.fileName
      : null;
  return { fileName, bookingNos };
}
