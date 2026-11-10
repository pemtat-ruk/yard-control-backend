import type { Department, Permission } from './permissions.js';

// กลุ่มสิทธิ์ตาม Master data ของ SA (ตาราง Roles)
export const ROLE_NAMES = [
  'General User',
  'Admin Staff',
  'Admin Manager',
  'IT Master',
  'Operation Inspector',
  'Operation Manager',
  'Executive Viewer',
  'CRM',
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

// [ชั่วคราว] สิทธิ์ของแต่ละกลุ่ม — seed ลง Role_Permission_Matrix; รอ SA ยืนยัน (docs/sa-schema-tasks.md ข้อ 14)
export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  'General User': [],
  'Admin Staff': [
    'BOOKING_CREATE_ON_BEHALF',
    'BOOKING_IMPORT_LONG_TERM',
    'REPORT_VIEW',
  ],
  'Admin Manager': [
    'BOOKING_CREATE_ON_BEHALF',
    'BOOKING_IMPORT_LONG_TERM',
    'REPORT_VIEW',
  ],
  'IT Master': [
    'LAYOUT_TOGGLE',
    'LAYOUT_EDIT',
    'PRICING_MANAGE',
    'SETTINGS_MANAGE',
    'REPORT_VIEW',
  ],
  'Operation Inspector': ['SLOT_INSPECT'],
  // ตาม Matrix พ.ย. 2569: ตรวจสอบลานจอด + ค่าปรับ + รายงาน (อนุมัติ Blacklist รอฟีเจอร์)
  'Operation Manager': ['SLOT_INSPECT', 'REPORT_VIEW'],
  // ผู้บริหาร: ดูรายงานและแดชบอร์ด
  'Executive Viewer': ['REPORT_VIEW'],
  // ผู้ขอใช้บริการเข้าสู่ระบบด้วย CRM ไม่ได้ใช้กลุ่มสิทธิ์ของพนักงาน — มีไว้ให้ตรงกับ Master data
  CRM: [],
};

const ROLE_DEPARTMENT: Partial<Record<string, Department>> = {
  'Admin Staff': 'CUSTOMER_SERVICE',
  'Admin Manager': 'CUSTOMER_SERVICE',
  'IT Master': 'IT',
  'Operation Inspector': 'YARD_MANAGEMENT',
  'Operation Manager': 'YARD_MANAGEMENT',
};

// ฝ่ายที่หน้าเว็บใช้เลือกหน้าแรก: กลุ่มแรกที่ผูกกับฝ่าย, ไม่มี = OTHER
export function departmentOfRoles(roleNames: string[]): Department {
  for (const name of roleNames) {
    const department = ROLE_DEPARTMENT[name];
    if (department) return department;
  }
  return 'OTHER';
}
