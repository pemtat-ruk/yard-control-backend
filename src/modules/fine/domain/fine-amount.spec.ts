import { overtimeFine, overtimeMinutesAt, slotsFine } from './fine-amount.js';

describe('fine for several slots', () => {
  const perSlot = overtimeFine({
    overtimeMinutes: 30,
    pricePerSlotRound: 100,
    multiplier: 2,
    roundHours: 4,
  });

  it('multiplies the per-slot amount by the number of slots fined', () => {
    expect(slotsFine(perSlot, 3)).toMatchObject({
      amount: 200,
      slots: 3,
      total: 600,
    });
  });

  it('keeps the per-slot amount as the total for a single slot', () => {
    expect(slotsFine(perSlot, 1).total).toBe(200);
  });

  it('rejects a fine without any slot', () => {
    expect(() => slotsFine(perSlot, 0)).toThrow(RangeError);
  });
});

describe('overtime fine', () => {
  it('charges each started 4-hour round at the booking price times the multiplier', () => {
    expect(
      overtimeFine({
        overtimeMinutes: 15 * 60 + 44,
        pricePerSlotRound: 100,
        multiplier: 2,
        roundHours: 4,
      }),
    ).toMatchObject({ rounds: 4, amount: 800 });
  });

  it('charges at least one round even for a few minutes over', () => {
    expect(
      overtimeFine({
        overtimeMinutes: 5,
        pricePerSlotRound: 100,
        multiplier: 2,
        roundHours: 4,
      }),
    ).toMatchObject({ rounds: 1, amount: 200 });
  });
});

describe('overtime minutes', () => {
  const at = (iso: string) => new Date(iso);
  const windows = [
    {
      startsAt: at('2026-10-15T08:00:00Z'),
      endsAt: at('2026-10-15T12:00:00Z'),
    },
    {
      startsAt: at('2026-10-14T08:00:00Z'),
      endsAt: at('2026-10-14T12:00:00Z'),
    },
  ];

  it('counts from the end of the latest finished booking window', () => {
    expect(overtimeMinutesAt(windows, at('2026-10-15T13:30:00Z'))).toBe(90);
  });

  it('is not overtime while a booked window is still running', () => {
    expect(overtimeMinutesAt(windows, at('2026-10-15T10:00:00Z'))).toBeNull();
  });

  it('is not overtime before any window has ended', () => {
    expect(overtimeMinutesAt(windows, at('2026-10-14T07:00:00Z'))).toBeNull();
  });
});

// ขอบของการปัดรอบ (รอบละ 4 ชม. = 240 นาที) และขอบเวลาที่รอบที่จองจบ
describe('overtime boundaries', () => {
  const fineFor = (overtimeMinutes: number) =>
    overtimeFine({
      overtimeMinutes,
      pricePerSlotRound: 100,
      multiplier: 2,
      roundHours: 4,
    }).rounds;

  it('charges one round up to exactly 240 minutes over and two from 241', () => {
    expect(fineFor(240)).toBe(1);
    expect(fineFor(241)).toBe(2);
  });

  const at = (iso: string) => new Date(iso);
  // 07:00–11:00 เวลาไทย
  const windows = [
    {
      startsAt: at('2026-10-27T00:00:00Z'),
      endsAt: at('2026-10-27T04:00:00Z'),
    },
  ];

  it('is not overtime one second before the booked time ends', () => {
    expect(overtimeMinutesAt(windows, at('2026-10-27T03:59:59Z'))).toBeNull();
  });

  it('starts counting overtime exactly when the booked time ends', () => {
    expect(overtimeMinutesAt(windows, at('2026-10-27T04:00:00Z'))).toBe(0);
    expect(overtimeMinutesAt(windows, at('2026-10-27T04:01:00Z'))).toBe(1);
  });

  it('keeps counting across midnight', () => {
    // จบ 23:00 เวลาไทย แล้วตรวจตอน 01:00 ของวันถัดไป = เกิน 120 นาที
    const lateRound = [
      {
        startsAt: at('2026-10-27T12:00:00Z'),
        endsAt: at('2026-10-27T16:00:00Z'),
      },
    ];
    expect(overtimeMinutesAt(lateRound, at('2026-10-27T18:00:00Z'))).toBe(120);
  });
});
