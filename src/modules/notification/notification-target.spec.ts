import { describe, expect, it } from 'vitest';
import { targetOf } from './notification.service.js';

describe('targetOf', () => {
  it('reads the booking of booking notifications', () => {
    expect(targetOf('expiring:BK2026-11-0031:2026-11-10')).toEqual({
      bookingNo: 'BK2026-11-0031',
      fineId: null,
    });
    expect(targetOf('overtime:BK2026-11-9001:2026-11-09:YD001')).toEqual({
      bookingNo: 'BK2026-11-9001',
      fineId: null,
    });
    expect(targetOf('due:BK2026-11-0007:3')).toEqual({
      bookingNo: 'BK2026-11-0007',
      fineId: null,
    });
    expect(targetOf('cancelled:BK2026-11-0002')).toEqual({
      bookingNo: 'BK2026-11-0002',
      fineId: null,
    });
  });

  it('reads the fine of a fine notification', () => {
    expect(targetOf('fine:1004')).toEqual({ bookingNo: null, fineId: 1004 });
  });

  it('has no target for an unknown key', () => {
    expect(targetOf('')).toEqual({ bookingNo: null, fineId: null });
  });
});
