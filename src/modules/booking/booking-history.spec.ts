import type { Prisma } from '@prisma/client';
import { snapshotBooking } from './booking-history.js';

// tx จำลอง: เก็บสิ่งที่ถูกเขียนลงตารางประวัติ
function fakeTx(header: object | null, lastGroup: number | null) {
  const written: Record<string, unknown[]> = {
    header: [],
    details: [],
    schedules: [],
  };
  const tx = {
    bookingHeader: { findUnique: () => Promise.resolve(header) },
    bookingHeaderHistory: {
      aggregate: () => Promise.resolve({ _max: { historyGroupId: lastGroup } }),
      create: ({ data }: { data: unknown }) => {
        written.header.push(data);
        return Promise.resolve(data);
      },
    },
    bookingDetailHistory: {
      createMany: ({ data }: { data: unknown[] }) => {
        written.details.push(...data);
        return Promise.resolve({ count: data.length });
      },
    },
    paymentScheduleHistory: {
      createMany: ({ data }: { data: unknown[] }) => {
        written.schedules.push(...data);
        return Promise.resolve({ count: data.length });
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, written };
}

const HEADER = {
  bookingNo: 'BK2026-11-0001',
  details: [{ bookingDetailId: 1n }, { bookingDetailId: 2n }],
  schedules: [{ payScheduleId: 10n }],
};

describe('keeping booking history before a change', () => {
  it('starts the history of a booking at group 1', async () => {
    const { tx, written } = fakeTx(HEADER, null);
    expect(await snapshotBooking(tx, 'BK2026-11-0001')).toBe(1);
    expect(written.header).toEqual([
      { bookingNo: 'BK2026-11-0001', historyGroupId: 1 },
    ]);
  });

  it('continues from the latest group of the same booking', async () => {
    const { tx } = fakeTx(HEADER, 3);
    expect(await snapshotBooking(tx, 'BK2026-11-0001')).toBe(4);
  });

  it('copies every detail and payment schedule into the same group', async () => {
    const { tx, written } = fakeTx(HEADER, 1);
    await snapshotBooking(tx, 'BK2026-11-0001');
    expect(written.details).toEqual([
      { bookingDetailId: 1n, historyGroupId: 2 },
      { bookingDetailId: 2n, historyGroupId: 2 },
    ]);
    expect(written.schedules).toEqual([
      { payScheduleId: 10n, historyGroupId: 2 },
    ]);
  });

  it('records nothing for a booking that does not exist', async () => {
    const { tx, written } = fakeTx(null, null);
    expect(await snapshotBooking(tx, 'BK-MISSING')).toBeNull();
    expect(written.header).toEqual([]);
  });
});
