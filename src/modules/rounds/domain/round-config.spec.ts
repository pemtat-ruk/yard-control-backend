import { scheduleOn } from '../../booking/domain/rounds.js';
import { checkRoundConfig, earliestEffectiveDate } from './round-config.js';

const TODAY = '2026-10-16';

describe('round config', () => {
  it('starts after the advance booking window', () => {
    expect(earliestEffectiveDate(TODAY)).toBe('2026-10-24');
  });

  it('accepts round lengths that divide a day', () => {
    expect(
      checkRoundConfig(
        { effectiveFrom: '2026-10-24', firstHour: 6, roundHours: 6 },
        TODAY,
      ),
    ).toBeNull();
  });

  it('rejects round lengths that leave a remainder, odd start hours and dates people can already book', () => {
    const base = { effectiveFrom: '2026-10-24', firstHour: 7, roundHours: 4 };
    expect(checkRoundConfig({ ...base, roundHours: 5 }, TODAY)).toBe(
      'ROUND_HOURS_INVALID',
    );
    expect(checkRoundConfig({ ...base, firstHour: 24 }, TODAY)).toBe(
      'ROUND_FIRST_HOUR_INVALID',
    );
    expect(
      checkRoundConfig({ ...base, effectiveFrom: '2026-10-23' }, TODAY),
    ).toBe('ROUND_EFFECTIVE_TOO_SOON');
  });
});

describe('schedule on a date', () => {
  const configs = [
    { effectiveFrom: '2026-11-01', firstHour: 6, roundHours: 6 },
    { effectiveFrom: '2026-12-01', firstHour: 8, roundHours: 4 },
  ];

  it('uses the default before any change', () => {
    expect(scheduleOn(configs, '2026-10-31')).toEqual({
      firstHour: 7,
      roundHours: 4,
    });
  });

  it('uses the latest change that has started', () => {
    expect(scheduleOn(configs, '2026-11-15')).toEqual({
      firstHour: 6,
      roundHours: 6,
    });
    expect(scheduleOn(configs, '2026-12-01')).toEqual({
      firstHour: 8,
      roundHours: 4,
    });
  });
});
