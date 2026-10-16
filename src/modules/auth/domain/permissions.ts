// ข้อ 2: สิทธิ์การใช้งานแต่ละฟังก์ชัน — ให้สิทธิ์เป็นรายบุคคลภายในฝ่ายที่กำหนด
export type Permission =
  | 'BOOKING_CREATE_SELF'
  | 'BOOKING_CREATE_ON_BEHALF'
  | 'BOOKING_IMPORT_LONG_TERM'
  | 'LAYOUT_TOGGLE'
  | 'LAYOUT_EDIT'
  | 'PRICING_MANAGE'
  | 'SLOT_INSPECT'
  | 'REPORT_VIEW'
  | 'SETTINGS_MANAGE';

export type Department =
  'CUSTOMER_SERVICE' | 'IT' | 'YARD_MANAGEMENT' | 'OTHER';

export type UserType = 'EMPLOYEE' | 'GREEN_SHIRT' | 'BUYER';

// ฝ่ายที่มีสิทธิ์ถือ permission แต่ละตัวได้; "CUSTOMER" = ผู้ขอใช้บริการ
// REPORT_VIEW ยังไม่กำหนดฝ่าย (เอกสารระบุ "กำหนดสิทธิ์ในภายหลัง")
export const PERMISSION_ELIGIBILITY: Record<
  Permission,
  ReadonlyArray<Department | 'CUSTOMER'>
> = {
  BOOKING_CREATE_SELF: ['CUSTOMER'],
  BOOKING_CREATE_ON_BEHALF: ['CUSTOMER_SERVICE'],
  BOOKING_IMPORT_LONG_TERM: ['CUSTOMER_SERVICE'],
  LAYOUT_TOGGLE: ['IT'],
  LAYOUT_EDIT: ['IT'],
  PRICING_MANAGE: ['IT'],
  SLOT_INSPECT: ['YARD_MANAGEMENT'],
  REPORT_VIEW: ['CUSTOMER_SERVICE', 'IT', 'YARD_MANAGEMENT', 'OTHER'],
  SETTINGS_MANAGE: ['IT'],
};

export type SessionUser = {
  type: UserType;
  department: Department | null;
  permissions: ReadonlyArray<Permission>;
};

export function canGrant(
  permission: Permission,
  user: Pick<SessionUser, 'type' | 'department'>,
): boolean {
  const group = user.type === 'EMPLOYEE' ? user.department : 'CUSTOMER';
  return group !== null && PERMISSION_ELIGIBILITY[permission].includes(group);
}

export function hasPermission(
  user: SessionUser,
  permission: Permission,
): boolean {
  return user.permissions.includes(permission) && canGrant(permission, user);
}
