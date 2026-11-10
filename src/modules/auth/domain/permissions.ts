// ข้อ 2: สิทธิ์การใช้งานแต่ละฟังก์ชัน — พนักงานได้สิทธิ์ตามกลุ่มสิทธิ์ (Roles → Role_Permission_Matrix → Permission_Actions)
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

export const PERMISSIONS: Permission[] = [
  'BOOKING_CREATE_SELF',
  'BOOKING_CREATE_ON_BEHALF',
  'BOOKING_IMPORT_LONG_TERM',
  'LAYOUT_TOGGLE',
  'LAYOUT_EDIT',
  'PRICING_MANAGE',
  'SLOT_INSPECT',
  'REPORT_VIEW',
  'SETTINGS_MANAGE',
];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as string[]).includes(value);
}

// ฝ่ายที่หน้าเว็บใช้เลือกหน้าแรกและเมนู — คิดจากกลุ่มสิทธิ์ของพนักงาน
export type Department =
  'CUSTOMER_SERVICE' | 'IT' | 'YARD_MANAGEMENT' | 'OTHER';

export type UserType = 'EMPLOYEE' | 'GREEN_SHIRT' | 'BUYER';

// ผู้ขอใช้บริการทุกคนจองให้ตัวเองได้ (ไม่มีกลุ่มสิทธิ์ใน Accounts_Roles)
export const CUSTOMER_PERMISSIONS: Permission[] = ['BOOKING_CREATE_SELF'];

export type SessionUser = { permissions: ReadonlyArray<Permission> };

export function hasPermission(
  user: SessionUser,
  permission: Permission,
): boolean {
  return user.permissions.includes(permission);
}
