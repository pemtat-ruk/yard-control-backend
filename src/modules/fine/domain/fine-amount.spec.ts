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
