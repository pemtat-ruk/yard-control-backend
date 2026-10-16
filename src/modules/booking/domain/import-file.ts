// ข้อ 2 ฟังก์ชันนำข้อมูลจองช่องจอด (ลูกค้าประจำ): ไฟล์ CSV แถวแรกเป็นหัวคอลัมน์
// หาคอลัมน์จากชื่อ (ไทยหรืออังกฤษ ลำดับใดก็ได้) — แบบฟอร์มใช้หัวภาษาไทยให้ฝ่ายบริการลูกค้ากรอกง่าย
export const IMPORT_COLUMNS = [
  'phone',
  'labor_card_no',
  'start_date',
  'end_date',
  'start_time',
  'rounds',
  'slots',
  'skip_dates',
] as const;

type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const COLUMN_ALIASES: Record<ImportColumn, string[]> = {
  phone: ['phone', 'เบอร์โทร'],
  labor_card_no: ['labor_card_no', 'เลขบัตรแรงงาน'],
  start_date: ['start_date', 'วันเริ่ม'],
  end_date: ['end_date', 'วันสิ้นสุด'],
  start_time: ['start_time', 'เวลาเริ่ม'],
  rounds: ['rounds', 'จำนวนรอบ'],
  slots: ['slots', 'ช่องจอด'],
  skip_dates: ['skip_dates', 'วันที่เว้น'],
};

// คอลัมน์ที่ต้องมีในไฟล์ (ที่เหลือว่างได้)
const REQUIRED_COLUMNS: ImportColumn[] = [
  'phone',
  'start_date',
  'end_date',
  'start_time',
  'rounds',
  'slots',
];

export const MAX_IMPORT_ROWS = 200;
// แถวที่ขึ้นต้นด้วย # เป็นหมายเหตุหรือแถวตัวอย่าง ไม่นำเข้า
const COMMENT_PREFIX = '#';
// ปี พ.ศ. (Excel ภาษาไทยบันทึกวันที่เป็น พ.ศ.)
const BUDDHIST_YEAR_FROM = 2400;
const BUDDHIST_YEAR_OFFSET = 543;
const MOBILE_DIGITS = 10;

export type ImportRowError =
  | 'IMPORT_CUSTOMER_MISSING'
  | 'IMPORT_DATE_INVALID'
  | 'IMPORT_TIME_INVALID'
  | 'IMPORT_ROUNDS_INVALID'
  | 'IMPORT_SLOTS_MISSING';

export type ImportRow = {
  line: number; // เลขบรรทัดในไฟล์ (นับหัวคอลัมน์เป็นบรรทัด 1) ให้ผู้ใช้หาแถวที่ผิดเจอ
  phone: string;
  laborCardNo: string;
  startDate: string;
  endDate: string;
  // เวลาเริ่ม "HH:MM" — service แปลงเป็นเลขรอบตามตารางรอบของวันเริ่ม
  startTime: string;
  roundCount: number;
  slotCodes: string[];
  skipDates: string[];
  errors: ImportRowError[];
};

export type ImportFileError = 'IMPORT_HEADER_INVALID' | 'IMPORT_TOO_MANY_ROWS';

// วันที่จากไฟล์ → "YYYY-MM-DD" หรือ null
// รับ 2026-11-01, 2026-11-01 00:00:00, 1/11/2026, 01-11-2569 (วัน/เดือน/ปี; ปี พ.ศ. แปลงเป็น ค.ศ.)
export function normalizeDate(value: string): string | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(text);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : dmy
      ? { year: Number(dmy[3]), month: Number(dmy[2]), day: Number(dmy[1]) }
      : null;
  if (!parts) return null;
  const year =
    parts.year >= BUDDHIST_YEAR_FROM
      ? parts.year - BUDDHIST_YEAR_OFFSET
      : parts.year;
  const date = new Date(Date.UTC(year, parts.month - 1, parts.day));
  // กันวันที่ไม่มีจริง เช่น 31/02
  if (
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

// เบอร์โทร: เหลือแต่ตัวเลข; Excel ตัดเลข 0 หน้าเบอร์มือถือ (800000000) จึงเติมกลับ
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length === MOBILE_DIGITS - 1 && !digits.startsWith('0')
    ? `0${digits}`
    : digits;
}

// เวลาเริ่ม: รับ 7:00, 07:00:00, 7.00, 07.00 น. → "07:00"
export function normalizeTime(value: string): string {
  const match = /^(\d{1,2})[:.](\d{2})/.exec(value.trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : value.trim();
}

// CSV ตาม RFC 4180: ค่าที่มีจุลภาค/ขึ้นบรรทัดอยู่ในเครื่องหมายคำพูด และ "" แทน " หนึ่งตัว
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  // Excel บันทึก UTF-8 พร้อม BOM ที่ต้นไฟล์
  const source = text.replace(/^﻿/, '');
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// รหัสช่องและวันที่เว้นคั่นด้วยช่องว่าง จุลภาค อัฒภาค หรือ |
function splitList(value: string): string[] {
  return value
    .split(/[\s,;|]+/)
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

const TIME_PATTERN = /^\d{2}:\d{2}$/;

// Excel บางภาษาบันทึก CSV คั่นด้วย ; — ดูจากแถวหัวคอลัมน์
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return (firstLine.match(/;/g)?.length ?? 0) >
    (firstLine.match(/,/g)?.length ?? 0)
    ? ';'
    : ',';
}

// แปลงไฟล์เป็นแถวการจอง พร้อมข้อผิดพลาดของรูปแบบข้อมูลรายแถว (กติกาการจองตรวจต่อที่ service)
export function parseImportFile(
  text: string,
): { ok: true; rows: ImportRow[] } | { ok: false; error: ImportFileError } {
  const [header, ...body] = parseCsv(text, detectDelimiter(text));
  const names = header?.map((name) => name.trim().toLowerCase()) ?? [];
  const indexOf = Object.fromEntries(
    IMPORT_COLUMNS.map((column) => [
      column,
      names.findIndex((name) => COLUMN_ALIASES[column].includes(name)),
    ]),
  ) as Record<ImportColumn, number>;
  if (REQUIRED_COLUMNS.some((column) => indexOf[column] < 0)) {
    return { ok: false, error: 'IMPORT_HEADER_INVALID' };
  }
  const lines = body
    .map((cells, index) => ({ cells, line: index + 2 }))
    .filter(({ cells }) => cells.some((cell) => cell.trim() !== ''))
    .filter(({ cells }) => !(cells[0] ?? '').trim().startsWith(COMMENT_PREFIX));
  if (lines.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: 'IMPORT_TOO_MANY_ROWS' };
  }

  const rows = lines.map(({ cells, line }): ImportRow => {
    const value = (column: ImportColumn) =>
      indexOf[column] < 0 ? '' : (cells[indexOf[column]] ?? '').trim();
    const startDate = normalizeDate(value('start_date'));
    const endDate = normalizeDate(value('end_date'));
    const skipDates = splitList(value('skip_dates')).map(normalizeDate);
    const startTime = normalizeTime(value('start_time'));
    const roundCount = Number(value('rounds'));
    const slotCodes = splitList(value('slots').toUpperCase());
    const phone = normalizePhone(value('phone'));
    const laborCardNo = value('labor_card_no').toUpperCase();

    const errors: ImportRowError[] = [];
    if (phone === '' && laborCardNo === '') {
      errors.push('IMPORT_CUSTOMER_MISSING');
    }
    if ([startDate, endDate, ...skipDates].some((date) => date === null)) {
      errors.push('IMPORT_DATE_INVALID');
    }
    if (!TIME_PATTERN.test(startTime)) errors.push('IMPORT_TIME_INVALID');
    if (!Number.isInteger(roundCount) || roundCount < 1) {
      errors.push('IMPORT_ROUNDS_INVALID');
    }
    if (slotCodes.length === 0) errors.push('IMPORT_SLOTS_MISSING');

    return {
      line,
      phone,
      laborCardNo,
      startDate: startDate ?? value('start_date'),
      endDate: endDate ?? value('end_date'),
      startTime,
      roundCount: Number.isInteger(roundCount) ? roundCount : 0,
      slotCodes: [...new Set(slotCodes)],
      skipDates: skipDates.filter((date): date is string => date !== null),
      errors,
    };
  });
  return { ok: true, rows };
}
