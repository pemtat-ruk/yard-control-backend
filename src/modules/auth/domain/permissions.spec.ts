import { hasPermission, type SessionUser } from './permissions.js';

describe('permissions', () => {
  const itStaff: SessionUser = {
    type: 'EMPLOYEE',
    department: 'IT',
    permissions: ['LAYOUT_EDIT', 'SLOT_INSPECT'],
  };

  it('allows a granted permission that the department may hold', () => {
    expect(hasPermission(itStaff, 'LAYOUT_EDIT')).toBe(true);
  });

  it('rejects a grant the department may not hold', () => {
    expect(hasPermission(itStaff, 'SLOT_INSPECT')).toBe(false);
  });

  it('rejects a permission that was never granted', () => {
    expect(hasPermission(itStaff, 'PRICING_MANAGE')).toBe(false);
  });

  it('lets registered customers book for themselves', () => {
    const buyer: SessionUser = {
      type: 'BUYER',
      department: null,
      permissions: ['BOOKING_CREATE_SELF'],
    };
    expect(hasPermission(buyer, 'BOOKING_CREATE_SELF')).toBe(true);
  });
});
