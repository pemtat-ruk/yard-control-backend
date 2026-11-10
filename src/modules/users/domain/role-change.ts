import { ROLE_PERMISSIONS, type RoleName } from '../../auth/domain/roles.js';

export type RoleChangeError = 'ROLE_NOT_FOUND' | 'PERMISSION_SELF_LOCKOUT';

export type RoleChange =
  | { ok: true; grant: bigint[]; revoke: bigint[] }
  | { ok: false; error: RoleChangeError };

type Role = { roleId: bigint; roleName: string };

function grantsSettings(roles: Role[]): boolean {
  return roles.some((role) =>
    (ROLE_PERMISSIONS[role.roleName as RoleName] ?? []).includes(
      'SETTINGS_MANAGE',
    ),
  );
}

// เทียบกลุ่มสิทธิ์เดิมกับที่ต้องการ: ผู้แก้ถอนกลุ่มที่ให้สิทธิ์ตั้งค่าระบบออกจากตัวเองไม่ได้
// (ถ้าถอนได้ อาจไม่มีใครเหลือที่ให้สิทธิ์คืนได้)
export function planRoleChange(input: {
  targetCode: string;
  actorCode: string;
  allRoles: Role[];
  current: bigint[];
  wanted: bigint[];
}): RoleChange {
  const { targetCode, actorCode, allRoles, current, wanted } = input;
  const byId = new Map(allRoles.map((role) => [role.roleId, role]));
  if (wanted.some((id) => !byId.has(id))) {
    return { ok: false, error: 'ROLE_NOT_FOUND' };
  }
  const rolesOf = (ids: bigint[]) =>
    ids.map((id) => byId.get(id)).filter((role): role is Role => !!role);
  if (
    targetCode === actorCode &&
    grantsSettings(rolesOf(current)) &&
    !grantsSettings(rolesOf(wanted))
  ) {
    return { ok: false, error: 'PERMISSION_SELF_LOCKOUT' };
  }
  return {
    ok: true,
    grant: wanted.filter((id) => !current.includes(id)),
    revoke: current.filter((id) => !wanted.includes(id)),
  };
}
