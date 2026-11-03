import { DEFAULT_SCHEDULE } from '../../booking/domain/rounds.js';
import { currentRoundIndex, heldDuring } from './availability.js';
import { compareSlotLabels, parseSlotLabel, slotLabel } from './slot-label.js';

// โลจิสติกส์ถือช่องรอบ 23:01–11:00 = รอบที่ 4, 5 และ 0 ของวันบริการ
const LOGISTICS = [0, 4, 5];
const day = (startRound: number, roundCount = 1) => ({
  startDate: '2026-11-05',
  endDate: '2026-11-05',
  startRound,
  roundCount,
});

describe('slots held for some rounds of every day', () => {
  it('lets customers book the daytime rounds', () => {
    expect(heldDuring(LOGISTICS, day(1, 3), DEFAULT_SCHEDULE)).toBe(false);
  });

  it('blocks a request that reaches into a held round', () => {
    expect(heldDuring(LOGISTICS, day(3, 2), DEFAULT_SCHEDULE)).toBe(true);
  });

  it('never blocks a slot with no held rounds', () => {
    expect(heldDuring([], day(0, 6), DEFAULT_SCHEDULE)).toBe(false);
  });
});

describe('current round of the service day', () => {
  const scheduleFor = () => DEFAULT_SCHEDULE;

  it('is the first round after 07:01', () => {
    expect(
      currentRoundIndex(new Date('2026-11-05T01:30:00Z'), scheduleFor),
    ).toBe(0);
  });

  it("is still yesterday's last round before 07:01", () => {
    // 05:00 เวลาไทย = รอบ 03:01–07:00 ของวันบริการเมื่อวาน
    expect(
      currentRoundIndex(new Date('2026-11-04T22:00:00Z'), scheduleFor),
    ).toBe(5);
  });
});

describe('slot labels with the lot', () => {
  it('joins and splits lot and slot, even when the slot has a slash', () => {
    expect(slotLabel('PR', '14/7')).toBe('PR-14/7');
    expect(parseSlotLabel('PR-14/7')).toEqual({ lot: 'PR', code: '14/7' });
  });

  it('rejects a code without a lot', () => {
    expect(parseSlotLabel('12')).toBeNull();
    expect(parseSlotLabel('P5-')).toBeNull();
  });

  it('sorts slot numbers as numbers', () => {
    expect(['P5-10', 'P5-2', 'P5-1'].sort(compareSlotLabels)).toEqual([
      'P5-1',
      'P5-2',
      'P5-10',
    ]);
  });
});
