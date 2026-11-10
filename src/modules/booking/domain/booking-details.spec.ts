import { summarizeDetails } from './booking-details.js';

const PER_DAY = 6;

describe('summarizeDetails', () => {
  it('turns detail rows back into days, rounds and slots', () => {
    const details = ['2026-11-10', '2026-11-12'].flatMap((serviceDate) =>
      [2, 3].flatMap((roundIndex) =>
        [8, 3].map((slotId) => ({ serviceDate, roundIndex, slotId })),
      ),
    );
    expect(summarizeDetails(details, PER_DAY)).toEqual({
      dates: ['2026-11-10', '2026-11-12'],
      startRound: 2,
      roundCount: 2,
      slotIds: [3, 8],
    });
  });

  it('keeps rounds that spill past the end of the service day in the same booking day', () => {
    // วันที่ 10 รอบสุดท้าย (5) + รอบแรกของวันที่ 11 (0) = จองวันที่ 10 วันเดียว 2 รอบ
    const details = [
      { serviceDate: '2026-11-10', roundIndex: 5, slotId: 1 },
      { serviceDate: '2026-11-11', roundIndex: 0, slotId: 1 },
    ];
    expect(summarizeDetails(details, PER_DAY)).toEqual({
      dates: ['2026-11-10'],
      startRound: 5,
      roundCount: 2,
      slotIds: [1],
    });
  });

  it('splits whole-day bookings into one day each', () => {
    const details = ['2026-11-10', '2026-11-11'].flatMap((serviceDate) =>
      [0, 1, 2, 3, 4, 5].map((roundIndex) => ({
        serviceDate,
        roundIndex,
        slotId: 1,
      })),
    );
    expect(summarizeDetails(details, PER_DAY)).toMatchObject({
      dates: ['2026-11-10', '2026-11-11'],
      startRound: 0,
      roundCount: 6,
    });
  });
});
