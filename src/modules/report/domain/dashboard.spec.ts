import { previousRange, summarizeLots } from './dashboard.js';

describe('dashboard previous range', () => {
  it('is the same length and ends just before the current range', () => {
    const from = new Date('2026-04-01T00:00:00+07:00');
    const to = new Date('2026-04-30T23:59:59.999+07:00');
    const previous = previousRange(from, to);
    expect(previous.to.getTime()).toBe(from.getTime() - 1);
    expect(previous.to.getTime() - previous.from.getTime()).toBe(
      to.getTime() - from.getTime(),
    );
  });
});

describe('dashboard lot summary', () => {
  it('counts slots and bookings per lot', () => {
    const result = summarizeLots([
      { lots: ['A', 'A'], paidAmount: 200 },
      { lots: ['B'], paidAmount: 100 },
    ]);
    expect(result).toEqual([
      { lot: 'A', slots: 2, bookings: 1, paidAmount: 200 },
      { lot: 'B', slots: 1, bookings: 1, paidAmount: 100 },
    ]);
  });

  it('splits the paid amount of a booking across lots by slot count', () => {
    const result = summarizeLots([{ lots: ['A', 'A', 'B'], paidAmount: 300 }]);
    expect(result).toEqual([
      { lot: 'A', slots: 2, bookings: 1, paidAmount: 200 },
      { lot: 'B', slots: 1, bookings: 1, paidAmount: 100 },
    ]);
  });

  it('skips bookings without slots', () => {
    expect(summarizeLots([{ lots: [], paidAmount: 50 }])).toEqual([]);
  });
});
