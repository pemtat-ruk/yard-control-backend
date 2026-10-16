import { DEFAULT_SCHEDULE } from '../../booking/domain/rounds.js';
import { freeSlotCount, type Occupancy } from './availability.js';

describe('free slot count for the booking page', () => {
  const open = [1, 2, 3, 4];
  const day = (startRound: number, roundCount = 1) => ({
    startDate: '2026-10-20',
    endDate: '2026-10-20',
    startRound,
    roundCount,
  });

  it('counts every open slot when nothing is taken', () => {
    expect(freeSlotCount(open, [], day(0), DEFAULT_SCHEDULE)).toBe(4);
  });

  it('removes a slot taken in any round the request covers', () => {
    const taken: Occupancy[] = [
      { slotId: 2, serviceDate: '2026-10-20', roundIndex: 1 },
    ];
    expect(freeSlotCount(open, taken, day(0), DEFAULT_SCHEDULE)).toBe(4);
    expect(freeSlotCount(open, taken, day(0, 2), DEFAULT_SCHEDULE)).toBe(3);
  });

  it('follows the last rounds past midnight into the next service date', () => {
    // รอบ 5 (03:00) ต่อด้วยรอบ 0 ของวันถัดไป
    const taken: Occupancy[] = [
      { slotId: 3, serviceDate: '2026-10-21', roundIndex: 0 },
    ];
    expect(freeSlotCount(open, taken, day(5, 2), DEFAULT_SCHEDULE)).toBe(3);
  });

  it('ignores skipped days of a multi-day booking', () => {
    const taken: Occupancy[] = [
      { slotId: 1, serviceDate: '2026-10-21', roundIndex: 0 },
    ];
    const range = {
      startDate: '2026-10-20',
      endDate: '2026-10-22',
      startRound: 0,
      roundCount: 1,
    };
    expect(freeSlotCount(open, taken, range, DEFAULT_SCHEDULE)).toBe(3);
    expect(
      freeSlotCount(
        open,
        taken,
        { ...range, skipDates: ['2026-10-21'] },
        DEFAULT_SCHEDULE,
      ),
    ).toBe(4);
  });

  it('never counts a slot that is not open to this viewer', () => {
    expect(freeSlotCount([1], [], day(0), DEFAULT_SCHEDULE)).toBe(1);
  });
});
