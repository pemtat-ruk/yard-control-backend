import { isBookableBy, resolveStatus, visibleStatus } from './slot-status.js';

describe('slot status', () => {
  it('shows overtime as available to customers only', () => {
    expect(visibleStatus('OVERTIME', 'CUSTOMER')).toBe('AVAILABLE');
    expect(visibleStatus('OVERTIME', 'INSPECTOR')).toBe('OVERTIME');
  });

  it('shows reserved as closed to customers only', () => {
    expect(visibleStatus('RESERVED', 'CUSTOMER')).toBe('CLOSED');
    expect(visibleStatus('RESERVED', 'CUSTOMER_SERVICE')).toBe('RESERVED');
  });

  it('lets only customer service book reserved slots', () => {
    expect(isBookableBy('RESERVED', 'CUSTOMER_SERVICE')).toBe(true);
    expect(isBookableBy('RESERVED', 'CUSTOMER')).toBe(false);
    expect(isBookableBy('OCCUPIED', 'CUSTOMER')).toBe(false);
    expect(isBookableBy('AVAILABLE', 'CUSTOMER')).toBe(true);
  });
});

describe('resolving a slot status', () => {
  const open = {
    baseStatus: 'OPEN',
    lotOpen: true,
    occupied: false,
    overtime: false,
  } as const;

  it('is available when open and unused', () => {
    expect(resolveStatus(open)).toBe('AVAILABLE');
  });

  it('is closed when the slot or its whole lot is closed, even if booked', () => {
    expect(resolveStatus({ ...open, lotOpen: false, occupied: true })).toBe(
      'CLOSED',
    );
    expect(resolveStatus({ ...open, baseStatus: 'CLOSED' })).toBe('CLOSED');
  });

  it('shows a booking before overtime, and overtime before reserved', () => {
    expect(resolveStatus({ ...open, occupied: true, overtime: true })).toBe(
      'OCCUPIED',
    );
    const reserved = { ...open, baseStatus: 'RESERVED' } as const;
    expect(resolveStatus({ ...reserved, overtime: true })).toBe('OVERTIME');
    expect(resolveStatus(reserved)).toBe('RESERVED');
  });
});
