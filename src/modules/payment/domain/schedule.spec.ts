import { dateRange } from '../../../common/service-date.js';
import { buildPaymentSchedule } from './schedule.js';

describe('payment schedule', () => {
  // ตัวอย่างในเอกสาร: 1-30 ก.ย. 5 ช่อง 4 ชม. 100 บาท/ช่อง
  const input = {
    dates: dateRange('2026-09-01', '2026-09-30'),
    slotCount: 5,
    roundCount: 1,
    pricePerSlotRound: 100,
  };

  it('charges the full amount up front', () => {
    const schedule = buildPaymentSchedule({ ...input, plan: 'FULL' });
    expect(schedule).toHaveLength(1);
    expect(schedule[0].amount).toBe(15000);
    expect(schedule[0].dueAt).toBeNull();
  });

  it('charges the last day up front and each other day by midnight before use', () => {
    const schedule = buildPaymentSchedule({ ...input, plan: 'DAILY' });
    expect(schedule).toHaveLength(30);
    expect(schedule[0]).toEqual({
      coversDates: ['2026-09-30'],
      amount: 500,
      dueAt: null,
    });
    expect(schedule[1].coversDates).toEqual(['2026-09-01']);
    expect(schedule[1].dueAt?.toISOString()).toBe('2026-08-31T17:00:00.000Z');
    expect(schedule[29].coversDates).toEqual(['2026-09-29']);
    expect(schedule.reduce((sum, item) => sum + item.amount, 0)).toBe(15000);
  });

  it('rejects the daily plan for a single day', () => {
    expect(() =>
      buildPaymentSchedule({ ...input, dates: ['2026-09-01'], plan: 'DAILY' }),
    ).toThrow();
  });
});

describe('daily plan booked on the day it starts', () => {
  it('adds days whose due time has already passed to the amount paid now', () => {
    const schedule = buildPaymentSchedule({
      dates: dateRange('2026-09-01', '2026-09-05'),
      slotCount: 1,
      roundCount: 1,
      pricePerSlotRound: 100,
      plan: 'DAILY',
      // 08:00 ของวันที่ 1 ก.ย. ตามเวลาไทย
      now: new Date('2026-09-01T01:00:00Z'),
    });
    expect(schedule[0]).toEqual({
      coversDates: ['2026-09-01', '2026-09-05'],
      amount: 200,
      dueAt: null,
    });
    expect(schedule.slice(1).map((item) => item.coversDates[0])).toEqual([
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ]);
  });
});
