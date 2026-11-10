import { planRoleChange } from './role-change.js';

describe('planRoleChange', () => {
  const allRoles = [
    { roleId: 2n, roleName: 'Admin Staff' },
    { roleId: 5n, roleName: 'IT Master' },
    { roleId: 6n, roleName: 'Operation Inspector' },
  ];

  it('lists the roles to add and remove', () => {
    expect(
      planRoleChange({
        targetCode: 'YD001',
        actorCode: 'IT001',
        allRoles,
        current: [2n],
        wanted: [6n],
      }),
    ).toEqual({ ok: true, grant: [6n], revoke: [2n] });
  });

  it('refuses a role that does not exist', () => {
    expect(
      planRoleChange({
        targetCode: 'YD001',
        actorCode: 'IT001',
        allRoles,
        current: [],
        wanted: [99n],
      }),
    ).toEqual({ ok: false, error: 'ROLE_NOT_FOUND' });
  });

  it('stops IT from removing their own settings access', () => {
    expect(
      planRoleChange({
        targetCode: 'IT001',
        actorCode: 'IT001',
        allRoles,
        current: [5n],
        wanted: [],
      }),
    ).toEqual({ ok: false, error: 'PERMISSION_SELF_LOCKOUT' });
  });
});
