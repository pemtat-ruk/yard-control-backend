import type { Prisma } from '@prisma/client';
import { todayInBangkok } from './service-date.js';

const RUNNING_DIGITS = 4;

// เลขที่เอกสารแบบ SA: Prefix + ปี ค.ศ.-เดือน-เลขรัน 4 หลัก เช่น BK2026-11-0001, R2026-11-0001, F2026-11-0001 (ค่าปรับ)
// รันใหม่ทุกเดือนตาม DocumentRunnings — ต้องเรียกใน transaction ล็อกแถวไว้ กันสองคำขอได้เลขเดียวกัน
export async function nextDocumentNo(
  tx: Prisma.TransactionClient,
  prefix: 'BK' | 'R' | 'F',
  createdBy: string,
  now: Date = new Date(),
): Promise<string> {
  const [year, month] = todayInBangkok(now).split('-');
  const rows = await tx.$queryRaw<{ RunningID: bigint; LastNumber: number }[]>`
    SELECT RunningID, LastNumber FROM DocumentRunnings WITH (UPDLOCK, HOLDLOCK)
    WHERE Prefix = ${prefix} AND [Year] = ${year} AND [Month] = ${month}`;
  let number: number;
  if (rows.length === 0) {
    number = 1;
    await tx.documentRunnings.create({
      data: { prefix, year, month, lastNumber: number, createdBy },
    });
  } else {
    number = rows[0].LastNumber + 1;
    await tx.documentRunnings.update({
      where: { runningId: rows[0].RunningID },
      data: { lastNumber: number },
    });
  }
  return `${prefix}${year}-${month}-${String(number).padStart(RUNNING_DIGITS, '0')}`;
}
