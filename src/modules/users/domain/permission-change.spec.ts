import {
  grantablePermissions,
  planPermissionChange,
} from './permission-change.js';

const inspector = {
  id: 2,
  type: 'EMPLOYEE' as const,
  department: 'YARD_MANAGEMENT' as const,
};
const itAdmin = { id: 1, type: 'EMPLOYEE' as const, department: 'IT' as const };

describe('permission change', () => {
  it('offers only the permissions that the department may hold', () => {
    expect(grantablePermissions(inspector)).toEqual([
      'SLOT_INSPECT',
      'REPORT_VIEW',
    ]);
  });

  it('works out what to grant and what to revoke', () => {
    expect(
      planPermissionChange({
        target: inspector,
        actorId: itAdmin.id,
        current: ['SLOT_INSPECT'],
        wanted: ['REPORT_VIEW'],
      }),
    ).toEqual({ ok: true, grant: ['REPORT_VIEW'], revoke: ['SLOT_INSPECT'] });
  });

  it('refuses a permission outside the department', () => {
    expect(
      planPermissionChange({
        target: inspector,
        actorId: itAdmin.id,
        current: [],
        wanted: ['PRICING_MANAGE'],
      }),
    ).toEqual({ ok: false, error: 'PERMISSION_NOT_ALLOWED' });
  });

  it('stops an admin from removing their own settings permission', () => {
    expect(
      planPermissionChange({
        target: itAdmin,
        actorId: itAdmin.id,
        current: ['SETTINGS_MANAGE', 'LAYOUT_EDIT'],
        wanted: ['LAYOUT_EDIT'],
      }),
    ).toEqual({ ok: false, error: 'PERMISSION_SELF_LOCKOUT' });
  });
});
