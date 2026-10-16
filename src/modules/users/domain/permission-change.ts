import {
  canGrant,
  PERMISSION_ELIGIBILITY,
  type Permission,
  type SessionUser,
} from '../../auth/domain/permissions.js';

export const PERMISSIONS = Object.keys(PERMISSION_ELIGIBILITY) as Permission[];

// สิทธิ์ที่ให้พนักงานคนนี้ได้ตามฝ่ายของเขา (ข้อ 2: สิทธิ์อยู่ในฝ่ายที่กำหนดเท่านั้น)
export function grantablePermissions(
  user: Pick<SessionUser, 'type' | 'department'>,
): Permission[] {
  return PERMISSIONS.filter((permission) => canGrant(permission, user));
}

export type PermissionChangeError =
  'PERMISSION_NOT_ALLOWED' | 'PERMISSION_SELF_LOCKOUT';

export type PermissionChange =
  | { ok: true; grant: Permission[]; revoke: Permission[] }
  | { ok: false; error: PermissionChangeError };

// เทียบสิทธิ์เดิมกับที่ต้องการ: ให้เฉพาะสิทธิ์ที่ฝ่ายถือได้ และผู้แก้ถอนสิทธิ์ตั้งค่าของตัวเองไม่ได้
// (ถ้าถอนได้ อาจไม่มีใครเหลือที่ให้สิทธิ์คืนได้)
export function planPermissionChange(input: {
  target: Pick<SessionUser, 'type' | 'department'> & { id: number };
  actorId: number;
  current: Permission[];
  wanted: Permission[];
}): PermissionChange {
  const { target, actorId, current, wanted } = input;
  if (wanted.some((permission) => !canGrant(permission, target))) {
    return { ok: false, error: 'PERMISSION_NOT_ALLOWED' };
  }
  if (
    target.id === actorId &&
    current.includes('SETTINGS_MANAGE') &&
    !wanted.includes('SETTINGS_MANAGE')
  ) {
    return { ok: false, error: 'PERMISSION_SELF_LOCKOUT' };
  }
  return {
    ok: true,
    grant: wanted.filter((permission) => !current.includes(permission)),
    revoke: current.filter((permission) => !wanted.includes(permission)),
  };
}
