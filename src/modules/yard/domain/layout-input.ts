import type { LayoutCell, LayoutRow, LotLayout } from './lot-layout.js';

// ผังที่แอดมินแก้จากหน้าจัดการผัง: ตรวจรูปแบบ และให้ทุกช่องในผังเป็นช่องที่มีอยู่จริงในลาน ไม่ซ้ำกัน
// ผังจัดวางช่องที่มีอยู่ (และช่องใหม่ที่สร้างพร้อมกัน) — ช่องที่ไม่ได้วาง หน้าเว็บต่อท้ายเป็นแถวสุดท้ายเอง จึงไม่กระทบการจอง
export const LAYOUT_MAX_ROWS = 60;
export const LAYOUT_MAX_CELLS = 120;
export const LAYOUT_LABEL_MAX = 40;
export const LAYOUT_SPAN_MAX = 30;

export type LayoutProblem =
  | { kind: 'INVALID' }
  | { kind: 'UNKNOWN_SLOT'; slot: string }
  | { kind: 'DUPLICATE_SLOT'; slot: string }
  | { kind: 'SLOT_TAKEN'; slot: string };

export type LayoutCheck =
  { ok: true; layout: LotLayout } | { ok: false; problem: LayoutProblem };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isLabel = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= LAYOUT_LABEL_MAX;

function parseCell(value: unknown): LayoutCell | null {
  if (!isRecord(value)) return null;
  if (typeof value.slot === 'string') return { slot: value.slot };
  if (!isLabel(value.label)) return null;
  const span = value.span ?? 1;
  if (!Number.isInteger(span) || (span as number) < 1) return null;
  if ((span as number) > LAYOUT_SPAN_MAX) return null;
  return { label: value.label.trim(), span: span as number };
}

function parseRow(value: unknown): LayoutRow | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'aisle') {
    if (value.label === undefined) return { kind: 'aisle' };
    return isLabel(value.label)
      ? { kind: 'aisle', label: value.label.trim() }
      : null;
  }
  if (value.kind !== 'slots') return null;
  if (value.facing !== 'UP' && value.facing !== 'DOWN') return null;
  if (!Array.isArray(value.cells) || value.cells.length > LAYOUT_MAX_CELLS)
    return null;
  const cells = value.cells.map(parseCell);
  if (cells.some((cell) => cell === null)) return null;
  return { kind: 'slots', facing: value.facing, cells: cells as LayoutCell[] };
}

// newSlots = ช่องที่แอดมินเพิ่มจากหน้าจัดผัง สร้างพร้อมกับบันทึกผัง — เลขต้องไม่ซ้ำช่องเดิมและไม่ซ้ำกันเอง
export function checkLayout(
  input: unknown,
  lotSlots: string[],
  newSlots: string[] = [],
): LayoutCheck {
  const invalid: LayoutCheck = { ok: false, problem: { kind: 'INVALID' } };
  if (!isRecord(input) || !Array.isArray(input.rows)) return invalid;
  if (input.rows.length > LAYOUT_MAX_ROWS) return invalid;
  const rows = input.rows.map(parseRow);
  if (rows.some((row) => row === null)) return invalid;

  const known = new Set(lotSlots);
  for (const slot of newSlots) {
    if (known.has(slot))
      return {
        ok: false,
        problem: lotSlots.includes(slot)
          ? { kind: 'SLOT_TAKEN', slot }
          : { kind: 'DUPLICATE_SLOT', slot },
      };
    known.add(slot);
  }
  const placed = new Set<string>();
  for (const row of rows as LayoutRow[]) {
    if (row.kind !== 'slots') continue;
    for (const cell of row.cells) {
      if (!('slot' in cell)) continue;
      if (!known.has(cell.slot))
        return {
          ok: false,
          problem: { kind: 'UNKNOWN_SLOT', slot: cell.slot },
        };
      if (placed.has(cell.slot))
        return {
          ok: false,
          problem: { kind: 'DUPLICATE_SLOT', slot: cell.slot },
        };
      placed.add(cell.slot);
    }
  }
  return { ok: true, layout: { rows: rows as LayoutRow[] } };
}

// ผังที่เก็บในฐานข้อมูล — อ่านไม่ได้ให้ถือว่าไม่มี (ใช้ผังตั้งต้นของลาน) ดีกว่าทำให้ทั้งหน้าผังล่ม
export function parseStoredLayout(text: string | null): LotLayout | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value) || !Array.isArray(value.rows)) return null;
    const rows = value.rows.map(parseRow);
    return rows.some((row) => row === null)
      ? null
      : { rows: rows as LayoutRow[] };
  } catch {
    return null;
  }
}
