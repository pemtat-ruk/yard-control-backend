import { minutesBetween, usagePhase } from './usage.js';

describe('slot usage phase', () => {
  const window = {
    startsAt: new Date('2026-09-01T00:00:00Z'),
    endsAt: new Date('2026-09-01T04:00:00Z'),
  };
  const at = (iso: string) => new Date(iso);

  it('is upcoming before the booked time and active during it', () => {
    expect(usagePhase(window, at('2026-08-31T23:59:00Z'), false)).toBe(
      'UPCOMING',
    );
    expect(usagePhase(window, at('2026-09-01T03:59:00Z'), false)).toBe(
      'ACTIVE',
    );
  });

  it('turns overtime the moment the booked time ends', () => {
    expect(usagePhase(window, at('2026-09-01T04:00:00Z'), false)).toBe(
      'OVERTIME',
    );
  });

  it('stops being overtime once the inspector records the vehicle left', () => {
    expect(usagePhase(window, at('2026-09-01T04:30:00Z'), true)).toBe('PAST');
  });

  it('frees the slot early when the vehicle leaves before the time ends', () => {
    expect(usagePhase(window, at('2026-09-01T02:00:00Z'), true)).toBe('PAST');
  });

  it('stops flagging overtime after the lookback period', () => {
    expect(usagePhase(window, at('2026-09-02T04:00:00Z'), false)).toBe('PAST');
  });

  it('counts whole minutes and never goes negative', () => {
    expect(minutesBetween(window.startsAt, at('2026-09-01T01:30:59Z'))).toBe(
      90,
    );
    expect(minutesBetween(window.endsAt, window.startsAt)).toBe(0);
  });
});
