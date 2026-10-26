import { describe, expect, it } from 'vitest';
import { crossedRoundBoundary } from './round-boundary.js';

const SCHEDULE = { firstHour: 7, roundHours: 4 };
// เวลาไทย = UTC+7: 11:00 น. = 04:00Z
const at = (iso: string) => new Date(iso);

describe('crossedRoundBoundary', () => {
  it('detects a round starting between two runs', () => {
    expect(
      crossedRoundBoundary(
        at('2026-10-16T03:59:30Z'),
        at('2026-10-16T04:00:30Z'),
        SCHEDULE,
      ),
    ).toBe(true);
  });

  it('stays quiet inside the same round', () => {
    expect(
      crossedRoundBoundary(
        at('2026-10-16T04:01:00Z'),
        at('2026-10-16T04:02:00Z'),
        SCHEDULE,
      ),
    ).toBe(false);
  });

  it('counts the overnight boundary at 03:00 Bangkok time', () => {
    // 03:00 น. = 20:00Z ของวันก่อน
    expect(
      crossedRoundBoundary(
        at('2026-10-16T19:59:00Z'),
        at('2026-10-16T20:00:00Z'),
        SCHEDULE,
      ),
    ).toBe(true);
  });

  it('follows a changed schedule', () => {
    const sixHours = { firstHour: 6, roundHours: 6 };
    // 12:00 น. = 05:00Z เป็นรอบใหม่ของตาราง 6 ชม.
    expect(
      crossedRoundBoundary(
        at('2026-10-16T04:59:00Z'),
        at('2026-10-16T05:00:00Z'),
        sixHours,
      ),
    ).toBe(true);
    expect(
      crossedRoundBoundary(
        at('2026-10-16T03:59:00Z'),
        at('2026-10-16T04:00:00Z'),
        sixHours,
      ),
    ).toBe(false);
  });
});
