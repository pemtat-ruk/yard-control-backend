// เลิกทำ "รถออกแล้ว" ได้ภายในเวลาสั้นๆ หลังกด เฉพาะผู้ตรวจคนที่บันทึกเอง — กันกดพลาดโดยไม่ต้องถามยืนยันทุกครั้ง
// (ถ้ายกเลิกได้ตลอด ผลตรวจจะเชื่อถือไม่ได้ และช่องที่ปล่อยไปแล้วอาจถูกจองต่อแล้ว)
export const INSPECTION_UNDO_MINUTES = 10;
const MS_PER_MINUTE = 60 * 1000;

export type InspectionUndoError =
  'INSPECTION_UNDO_NOT_ALLOWED' | 'INSPECTION_UNDO_EXPIRED';

export function checkInspectionUndo(
  inspection: { inspectorId: number; result: string; createdAt: Date },
  actorId: number,
  now: Date,
): InspectionUndoError | null {
  if (inspection.result !== 'VACATED' || inspection.inspectorId !== actorId) {
    return 'INSPECTION_UNDO_NOT_ALLOWED';
  }
  const age = now.getTime() - inspection.createdAt.getTime();
  return age > INSPECTION_UNDO_MINUTES * MS_PER_MINUTE
    ? 'INSPECTION_UNDO_EXPIRED'
    : null;
}
