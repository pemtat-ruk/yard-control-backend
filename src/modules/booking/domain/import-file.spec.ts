import { parseCsv, parseImportFile } from './import-file.js';

const HEADER =
  'phone,labor_card_no,start_date,end_date,start_time,rounds,slots,skip_dates';

describe('import CSV', () => {
  it('reads quoted values, escaped quotes and Windows line endings', () => {
    expect(parseCsv('﻿a,"b,c","say ""hi"""\r\n1,2,3')).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });

  it('turns each line into a booking row', () => {
    const result = parseImportFile(
      `${HEADER}\n0800000000,,2026-11-01,2026-11-30,7:00,2,"A01 A02",2026-11-15\n`,
    );
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          line: 2,
          phone: '0800000000',
          laborCardNo: '',
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          startTime: '07:00',
          roundCount: 2,
          slotCodes: ['A01', 'A02'],
          skipDates: ['2026-11-15'],
          errors: [],
        },
      ],
    });
  });

  it('reports what is wrong on each line', () => {
    const result = parseImportFile(
      `${HEADER}\n,,2026-13,2026-11-30,เช้า,0,,\n`,
    );
    expect(result.ok && result.rows[0].errors).toEqual([
      'IMPORT_CUSTOMER_MISSING',
      'IMPORT_DATE_INVALID',
      'IMPORT_TIME_INVALID',
      'IMPORT_ROUNDS_INVALID',
      'IMPORT_SLOTS_MISSING',
    ]);
  });

  it('rejects a file without the expected header', () => {
    expect(parseImportFile('phone,date\n0800000000,2026-11-01')).toEqual({
      ok: false,
      error: 'IMPORT_HEADER_INVALID',
    });
  });

  it('skips blank lines', () => {
    const result = parseImportFile(
      `${HEADER}\n\n,,,,,,,\n0800000000,,2026-11-01,2026-11-02,07:00,1,A01,\n`,
    );
    expect(result.ok && result.rows.map((row) => row.line)).toEqual([4]);
  });
});

describe('import file saved from Excel', () => {
  it('reads Thai headers, semicolons, Buddhist-year dates, a phone without its leading zero and times with seconds', () => {
    const result = parseImportFile(
      'เบอร์โทร;เลขบัตรแรงงาน;วันเริ่ม;วันสิ้นสุด;เวลาเริ่ม;จำนวนรอบ;ช่องจอด;วันที่เว้น\n800000000;;1/11/2569;30/11/2569;7:00:00;2;a01, a02;15/11/2569\n',
    );
    expect(result.ok && result.rows[0]).toMatchObject({
      phone: '0800000000',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      startTime: '07:00',
      slotCodes: ['A01', 'A02'],
      skipDates: ['2026-11-15'],
      errors: [],
    });
  });

  it('skips rows that start with # (notes and template examples)', () => {
    const result = parseImportFile(
      'เบอร์โทร,วันเริ่ม,วันสิ้นสุด,เวลาเริ่ม,จำนวนรอบ,ช่องจอด\n# ตัวอย่าง,2026-11-01,2026-11-02,07:00,1,A01\n0800000000,2026-11-01,2026-11-02,07:00,1,A01\n',
    );
    expect(result.ok && result.rows.map((row) => row.line)).toEqual([3]);
  });

  it('rejects dates that do not exist', () => {
    const result = parseImportFile(
      'phone,start_date,end_date,start_time,rounds,slots\n0800000000,31/02/2026,2026-03-02,07:00,1,A01\n',
    );
    expect(result.ok && result.rows[0].errors).toEqual(['IMPORT_DATE_INVALID']);
  });
});
