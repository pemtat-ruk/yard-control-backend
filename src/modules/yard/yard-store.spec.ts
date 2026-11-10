import { slotFromDb } from './yard-store.js';

describe('slot rows from the database', () => {
  const lot = {
    id: 1,
    code: 'P5',
    name: 'อาคารจอด 5',
    isOpen: true,
    sortOrder: 0,
  };
  const row = {
    parkingSlotId: 7n,
    parkingId: 1n,
    slot: '12',
  };

  it('reads a reserved slot from its status control', () => {
    expect(
      slotFromDb({ ...row, controls: [{ slotStatusCode: 'RESERVED' }] }, lot),
    ).toMatchObject({ id: 7, code: '12', baseStatus: 'RESERVED' });
  });

  it('reads a closed slot from its status control', () => {
    expect(
      slotFromDb({ ...row, controls: [{ slotStatusCode: 'CLOSED' }] }, lot),
    ).toMatchObject({ baseStatus: 'CLOSED' });
  });

  it('treats a slot without a status control in effect as open', () => {
    expect(slotFromDb({ ...row, controls: [] }, lot)).toMatchObject({
      baseStatus: 'OPEN',
    });
  });
});
