import type { LayoutCell, LotLayout } from './lot-layout.js';

// [เรา] ผังวาดของลานจริง — SA ไม่มีที่เก็บผัง จึงเก็บเป็น config ในโค้ด จับคู่ลานด้วยรหัสลาน (ParkingExtra.Code)
// seed ใช้รายการนี้สร้าง Parking / ParkingSlot ด้วย
// ลานจอดจริงของตลาด (พ.ย. 2569) จากผังของ รปภ. และตารางช่องจอดของฝ่ายนิวProcess
// เลขช่องตามที่ใช้หน้างาน (ซ้ำกันข้ามลานได้) — หน้าเว็บแสดงเป็นรหัสเต็ม "ลาน-ช่อง" เช่น P5-12
// ⚠️ รอยืนยัน: หน้าศูนย์อาหาร (ผัง 25 ช่อง แต่ตาราง 64), ผักทั่วไป 2 (ใช้ตามตาราง), อาคารจอด 4 (ยังไม่มีผัง)

export type LotSeed = {
  code: string;
  name: string;
  layout: LotLayout | null;
  // ช่องที่ไม่อยู่ในผัง (ลานที่ยังไม่มีผัง)
  extraSlots?: string[];
};

const range = (from: number, to: number): string[] => {
  const step = from <= to ? 1 : -1;
  const codes: string[] = [];
  for (let n = from; n !== to + step; n += step) codes.push(String(n));
  return codes;
};
const slots = (codes: string[]): LayoutCell[] =>
  codes.map((slot) => ({ slot }));
const label = (text: string, span = 1): LayoutCell => ({ label: text, span });
const gap = (span = 1): LayoutCell => ({ label: '', span });
const AISLE = { kind: 'aisle' as const };

// ลานจอดตลาดผักปรุงรส: ผังมี 16 บล็อก บล็อกละ 7 ช่อง (112 ช่อง) — ตาราง Excel ใช้เลข "บล็อก/ช่อง" (14/7)
// ระบบใช้เลขรันทั้งลานแบบลานอื่น: เลขช่อง = (บล็อก − 1) × 7 + ช่อง (1/1 = 1, 2/1 = 8, 14/7 = 98, 16/7 = 112) บล็อกเป็นป้ายบนผัง
const PR_BLOCK_COUNT = 16;
const PR_BLOCK_SIZE = 7;
const prSlot = (no: number, n: number): number => (no - 1) * PR_BLOCK_SIZE + n;
// ในผังเลขช่องของบล็อกไล่จากขวาไปซ้าย (x/1 อยู่ขวาสุด)
const block = (no: number): LayoutCell[] =>
  slots(range(prSlot(no, PR_BLOCK_SIZE), prSlot(no, 1)));
const blockLabel = (no: number): LayoutCell =>
  label(`บล็อก ${no}`, PR_BLOCK_SIZE);
// แถวของบล็อกเรียงซ้ายไปขวาตามผัง คั่นด้วยช่องเว้น
const blockRow = (cell: (no: number) => LayoutCell[], blocks: number[]) =>
  blocks.flatMap((no, i) => [...(i > 0 ? [gap()] : []), ...cell(no)]);
// เลขเดิม "บล็อก/ช่อง" → เลขใหม่ (แปลงข้อมูลเดิม และทำตารางเทียบให้หน้างาน)
export const PR_OLD_TO_NEW: [old: string, code: string][] = range(
  1,
  PR_BLOCK_COUNT,
).flatMap((no) =>
  range(1, PR_BLOCK_SIZE).map((n): [string, string] => [
    `${no}/${n}`,
    String(prSlot(Number(no), Number(n))),
  ]),
);

export const REAL_LOTS: LotSeed[] = [
  {
    code: 'P4',
    name: 'อาคารจอด 4',
    // ยังไม่มีผังจาก รปภ. มีแค่ตารางช่อง 1–64: เรียงชั่วคราวแบบอาคารจอด 5 คือ 4 แถว แถวละ 16 สองทางรถ
    layout: {
      rows: [
        { kind: 'slots', facing: 'UP', cells: slots(range(1, 16)) },
        AISLE,
        { kind: 'slots', facing: 'DOWN', cells: slots(range(32, 17)) },
        { kind: 'slots', facing: 'UP', cells: slots(range(33, 48)) },
        AISLE,
        { kind: 'slots', facing: 'DOWN', cells: slots(range(64, 49)) },
      ],
    },
  },
  {
    code: 'P5',
    name: 'อาคารจอด 5',
    layout: {
      rows: [
        { kind: 'slots', facing: 'UP', cells: slots(range(4, 20)) },
        AISLE,
        {
          kind: 'slots',
          facing: 'DOWN',
          cells: [...slots(range(3, 1)), gap(), ...slots(range(35, 21))],
        },
        {
          kind: 'slots',
          facing: 'UP',
          cells: [gap(4), ...slots(range(36, 49))],
        },
        AISLE,
        {
          kind: 'slots',
          facing: 'DOWN',
          cells: [
            label('จอดจักรยานยนต์', 2),
            ...slots(range(63, 55)),
            gap(3),
            ...slots(range(54, 50)),
          ],
        },
        { kind: 'aisle', label: 'โลจิสติกส์' },
      ],
    },
  },
  {
    code: 'FC',
    name: 'หน้าศูนย์อาหาร',
    layout: {
      rows: [
        { kind: 'slots', facing: 'UP', cells: slots(range(10, 1)) },
        AISLE,
        { kind: 'slots', facing: 'DOWN', cells: slots(range(21, 11)) },
        {
          kind: 'slots',
          facing: 'UP',
          // ที่จอดมอเตอร์ไซค์อยู่ใต้ช่อง 21–16 ช่อง 25–22 อยู่ใต้ช่อง 15–12
          cells: [label('จอดจักรยานยนต์', 6), ...slots(range(25, 22))],
        },
        AISLE,
      ],
    },
  },
  {
    code: 'V2',
    name: 'ผักทั่วไป 2',
    layout: {
      rows: [
        {
          kind: 'slots',
          facing: 'UP',
          // ตามผัง รปภ.: ล็อก 1–6 = ช่อง 1–24, ล็อก 7 = ถนน, ล็อก 8 = ซุ้ม + ช่อง 31–32, ล็อก 9–10 = ช่อง 33–40, ล็อก 11–13 = โลจิสติกส์
          // (ตาราง Excel เขียนว่า 35–36 เป็นถนนเข้าแผงค้า และ 37–40 เป็นโลจิสติกส์ — รอ SA ยืนยัน)
          cells: [
            ...slots(range(1, 24)),
            label('ถนน', 4),
            label('ซุ้มสะดวกซื้อ', 2),
            ...slots(range(31, 40)),
            label('โลจิสติกส์', 4),
            label('โลจิสติกส์', 4),
            label('โลจิสติกส์', 4),
          ],
        },
        // ผังของ รปภ.: ทางรถวิ่งทางเดียว จากช่อง 1 ไปทางโลจิสติกส์
        { kind: 'aisle', label: 'ทางรถวิ่ง →' },
      ],
    },
  },
  {
    code: 'PR',
    // ชื่อตาม sheet "ลานจอด3_2 ตลาดผักปรุงรส" และไฟล์ผัง "ผังลานจอด3_2 ตลาดผักปรุงรส" (3_2 ไม่ใช่ชื่อลาน)
    name: 'ลานจอดตลาดผักปรุงรส',
    // ตามรูปผัง: บล็อก 13/14 หันเข้าทางรถเส้นเดียวกัน และ 15/16 ก็เช่นกัน; ซ้ายไปขวา = บล็อก 13 9 5 1 (แถวบนสุด)
    layout: {
      rows: [
        {
          kind: 'slots',
          facing: 'UP',
          cells: blockRow((no) => [blockLabel(no)], [13, 9, 5, 1]),
        },
        { kind: 'slots', facing: 'UP', cells: blockRow(block, [13, 9, 5, 1]) },
        AISLE,
        {
          kind: 'slots',
          facing: 'DOWN',
          cells: blockRow(block, [14, 10, 6, 2]),
        },
        {
          kind: 'slots',
          facing: 'DOWN',
          cells: blockRow((no) => [blockLabel(no)], [14, 10, 6, 2]),
        },
        {
          kind: 'slots',
          facing: 'UP',
          cells: blockRow((no) => [blockLabel(no)], [15, 11, 7, 3]),
        },
        { kind: 'slots', facing: 'UP', cells: blockRow(block, [15, 11, 7, 3]) },
        AISLE,
        {
          kind: 'slots',
          facing: 'DOWN',
          cells: blockRow(block, [16, 12, 8, 4]),
        },
        {
          kind: 'slots',
          facing: 'DOWN',
          cells: blockRow((no) => [blockLabel(no)], [16, 12, 8, 4]),
        },
      ],
    },
  },
];

// รหัสช่องทั้งหมดของลาน: ช่องในผังตามลำดับ + ช่องนอกผัง
export function slotCodesOf(lot: LotSeed): string[] {
  const inLayout = (lot.layout?.rows ?? []).flatMap((row) =>
    row.kind === 'slots'
      ? row.cells.flatMap((cell) => ('slot' in cell ? [cell.slot] : []))
      : [],
  );
  return [...inLayout, ...(lot.extraSlots ?? [])];
}

// ผังของลานตามรหัส — ลานที่ไม่มีในรายการ (เพิ่มจากหน้าจัดการผัง) ใช้ผังตั้งต้น
export function layoutOf(code: string): LotLayout | null {
  return REAL_LOTS.find((lot) => lot.code === code)?.layout ?? null;
}
