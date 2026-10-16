import {
  bookedDatesWithin,
  firstOpenRound,
  usageWindow,
  classifyBooking,
  expandRounds,
  listRounds,
  roundAfterUsage,
  roundWindow,
  serviceDates,
  validateBookingRequest,
  DEFAULT_SCHEDULE,
  scheduleOn,
} from './rounds.js';

const S = DEFAULT_SCHEDULE;
// ตารางรอบตั้งต้นทุกวัน
const everyDay = () => DEFAULT_SCHEDULE;

describe('booking rounds', () => {
  it('starts at 07:00 with 4-hour rounds', () => {
    expect(listRounds(S).map((round) => round.label)).toEqual([
      '07:00-11:00',
      '11:00-15:00',
      '15:00-19:00',
      '19:00-23:00',
      '23:00-03:00',
      '03:00-07:00',
    ]);
  });

  it('converts a round to Bangkok-time instants, crossing midnight', () => {
    const { startsAt, endsAt } = roundWindow('2026-09-01', 4, S);
    expect(startsAt.toISOString()).toBe('2026-09-01T16:00:00.000Z');
    expect(endsAt.toISOString()).toBe('2026-09-01T20:00:00.000Z');
  });

  it('finds the round right after a usage window, rolling into the next service day', () => {
    expect(roundAfterUsage('2026-09-01', 0, 1, S)).toEqual({
      serviceDate: '2026-09-01',
      roundIndex: 1,
    });
    expect(roundAfterUsage('2026-09-01', 4, 2, S)).toEqual({
      serviceDate: '2026-09-02',
      roundIndex: 0,
    });
  });

  it('classifies by total duration', () => {
    const base = { startRound: 0, roundCount: 1 };
    expect(
      classifyBooking({
        ...base,
        startDate: '2026-09-01',
        endDate: '2026-09-01',
      }),
    ).toBe('SHORT');
    expect(
      classifyBooking({
        ...base,
        startDate: '2026-09-01',
        endDate: '2026-09-02',
      }),
    ).toBe('LONG');
  });

  it('allows booking up to 7 days ahead', () => {
    const request = {
      startDate: '2026-09-08',
      endDate: '2026-09-30',
      startRound: 0,
      roundCount: 1,
    };
    expect(validateBookingRequest(request, '2026-09-01', everyDay)).toEqual([]);
    expect(validateBookingRequest(request, '2026-08-31', everyDay)).toEqual([
      'START_TOO_FAR_AHEAD',
    ]);
    expect(validateBookingRequest(request, '2026-09-09', everyDay)).toEqual([
      'START_IN_PAST',
    ]);
  });

  it('requires at least one round', () => {
    const request = {
      startDate: '2026-09-01',
      endDate: '2026-09-01',
      startRound: 0,
      roundCount: 0,
    };
    expect(validateBookingRequest(request, '2026-09-01', everyDay)).toEqual([
      'ROUND_COUNT_INVALID',
    ]);
  });

  it("repeats the first day's window every day and rolls overflow into the next service day", () => {
    const keys = expandRounds(
      {
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        startRound: 5,
        roundCount: 2,
      },
      S,
    );
    expect(keys).toEqual([
      { serviceDate: '2026-09-01', roundIndex: 5 },
      { serviceDate: '2026-09-02', roundIndex: 0 },
      { serviceDate: '2026-09-02', roundIndex: 5 },
      { serviceDate: '2026-09-03', roundIndex: 0 },
    ]);
  });
});

describe('usage window', () => {
  it('runs from the first booked round for the booked number of rounds', () => {
    const { startsAt, endsAt } = usageWindow('2026-09-01', 1, 2, S);
    expect(startsAt.toISOString()).toBe('2026-09-01T04:00:00.000Z');
    expect(endsAt.toISOString()).toBe('2026-09-01T12:00:00.000Z');
  });

  it('rejects a booking for today whose time has already ended', () => {
    const request = {
      startDate: '2026-09-01',
      endDate: '2026-09-01',
      startRound: 0,
      roundCount: 1,
    };
    const beforeEnd = new Date('2026-09-01T03:59:00Z');
    const afterEnd = new Date('2026-09-01T04:00:00Z');
    expect(
      validateBookingRequest(request, '2026-09-01', everyDay, beforeEnd),
    ).toEqual([]);
    expect(
      validateBookingRequest(request, '2026-09-01', everyDay, afterEnd),
    ).toEqual(['ROUND_ALREADY_ENDED']);
  });
});

describe('first open round of today', () => {
  it('skips rounds that have already ended', () => {
    // 14:00 ตามเวลาไทย: รอบ 07:00 จบแล้ว รอบ 11:00-15:00 ยังไม่จบ
    expect(
      firstOpenRound('2026-09-01', new Date('2026-09-01T07:00:00Z'), S),
    ).toBe(1);
    // 15:00 พอดี: รอบ 11:00-15:00 จบแล้ว
    expect(
      firstOpenRound('2026-09-01', new Date('2026-09-01T08:00:00Z'), S),
    ).toBe(2);
  });

  it('offers every round before the service day starts', () => {
    expect(
      firstOpenRound('2026-09-01', new Date('2026-08-31T20:00:00Z'), S),
    ).toBe(0);
  });
});

describe('booking with skipped days', () => {
  const request = {
    startDate: '2026-09-14',
    endDate: '2026-09-16',
    startRound: 0,
    roundCount: 1,
    skipDates: ['2026-09-15'],
  };

  it('books only the days that are not skipped', () => {
    expect(serviceDates(request)).toEqual(['2026-09-14', '2026-09-16']);
    expect(expandRounds(request, S).map((key) => key.serviceDate)).toEqual([
      '2026-09-14',
      '2026-09-16',
    ]);
  });

  it('still counts as long-term when two or more days are booked', () => {
    expect(classifyBooking(request)).toBe('LONG');
  });

  it('accepts skipping days strictly between the first and last day', () => {
    expect(validateBookingRequest(request, '2026-09-14', everyDay)).toEqual([]);
  });

  it('rejects skipping the first or last day, or a day outside the range', () => {
    for (const skipped of ['2026-09-14', '2026-09-16', '2026-09-20']) {
      expect(
        validateBookingRequest(
          { ...request, skipDates: [skipped] },
          '2026-09-14',
          everyDay,
        ),
      ).toEqual(['SKIP_DATE_INVALID']);
    }
  });

  it('keeps only booked days inside a window, in date order', () => {
    expect(
      bookedDatesWithin(
        ['2026-09-16', '2026-09-14', '2026-09-20'],
        '2026-09-13',
        '2026-09-17',
      ),
    ).toEqual(['2026-09-14', '2026-09-16']);
  });
});

describe('round schedule set by IT', () => {
  const sixHours = { firstHour: 6, roundHours: 6 };

  it('lists rounds from the configured start and length', () => {
    expect(listRounds(sixHours).map((round) => round.label)).toEqual([
      '06:00-12:00',
      '12:00-18:00',
      '18:00-00:00',
      '00:00-06:00',
    ]);
  });

  it('limits round count by the rounds in a day', () => {
    const request = {
      startDate: '2026-11-02',
      endDate: '2026-11-02',
      startRound: 0,
      roundCount: 5,
    };
    expect(
      validateBookingRequest(request, '2026-11-01', () => sixHours),
    ).toEqual(['ROUND_COUNT_INVALID']);
  });

  it('refuses a booking that runs into a day with a different schedule', () => {
    const configs = [{ effectiveFrom: '2026-11-05', ...sixHours }];
    const scheduleFor = (date: string) => scheduleOn(configs, date);
    const crossing = {
      startDate: '2026-11-03',
      endDate: '2026-11-05',
      startRound: 0,
      roundCount: 1,
    };
    expect(validateBookingRequest(crossing, '2026-11-01', scheduleFor)).toEqual(
      ['ROUND_SCHEDULE_CHANGES'],
    );
    // วันก่อนวันเปลี่ยน รอบ 03:00-07:00 จบหลัง 06:00 ที่วันใหม่เริ่ม = ทับกัน
    const overlapping = {
      startDate: '2026-11-04',
      endDate: '2026-11-04',
      startRound: 5,
      roundCount: 1,
    };
    expect(
      validateBookingRequest(overlapping, '2026-11-01', scheduleFor),
    ).toEqual(['ROUND_SCHEDULE_CHANGES']);
    const before = { ...overlapping, startRound: 0 };
    expect(validateBookingRequest(before, '2026-11-01', scheduleFor)).toEqual(
      [],
    );
  });
});
