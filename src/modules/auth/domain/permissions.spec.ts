import { hasPermission, type SessionUser } from './permissions.js';
import { departmentOfRoles } from './roles.js';

describe('permissions', () => {
  const itStaff: SessionUser = { permissions: ['LAYOUT_EDIT'] };

  it('allows a permission that the role grants', () => {
    expect(hasPermission(itStaff, 'LAYOUT_EDIT')).toBe(true);
  });

  it('rejects a permission that no role grants', () => {
    expect(hasPermission(itStaff, 'PRICING_MANAGE')).toBe(false);
  });
});

describe('departmentOfRoles', () => {
  it('maps a role to the department the web app uses', () => {
    expect(departmentOfRoles(['IT Master'])).toBe('IT');
    expect(departmentOfRoles(['Operation Inspector'])).toBe('YARD_MANAGEMENT');
    expect(departmentOfRoles(['Admin Staff'])).toBe('CUSTOMER_SERVICE');
  });

  it('uses OTHER when no role belongs to a department', () => {
    expect(departmentOfRoles(['General User'])).toBe('OTHER');
    expect(departmentOfRoles([])).toBe('OTHER');
  });
});
