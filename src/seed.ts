import 'dotenv/config';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '@prisma/client';
import { toDbDate } from './common/service-date.js';
import { env } from './config/env.js';
import { formatCusId } from './modules/auth/domain/customer.js';
import { hashPassword } from './modules/auth/domain/password.js';
import { PERMISSIONS } from './modules/auth/domain/permissions.js';
import {
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  type RoleName,
} from './modules/auth/domain/roles.js';
import { DEFAULT_SCHEDULE } from './modules/booking/domain/rounds.js';
import { roundRows } from './modules/layout/domain/round-set.js';
import { REAL_LOTS, slotCodesOf } from './modules/yard/domain/lot-layouts.js';

// ข้อมูลตั้งต้นสำหรับเครื่องพัฒนาและเซิร์ฟเวอร์ทดสอบ: npm run db:seed (รันซ้ำได้ ไม่สร้างซ้ำ ไม่เขียนทับของเดิม)
// ค่าคงที่ตาม Master data ของ SA + ลานจริงของตลาด (yard/domain/lot-layouts.ts) + บัญชีทดสอบ
const SEED_BY = 'SEED';
// ชุดรอบ / เวอร์ชันผังแรกมีผลตั้งแต่วันนี้ย้อนไปพอ — ครอบคลุมการจองและรายงานย้อนหลังบนเครื่องทดสอบ
const FIRST_EFFECTIVE_DATE = '2026-01-01';
const FIRST_ROUND_NO = 'R2026-01-0001';

// ───────── Master data (Program Specification_YCS – Master) ─────────

const BOOKING_TYPES = [
  { bookingType: 'S', bookingTypeTh: 'จองระยะสั้น', bookingTypeEn: 'Short' },
  { bookingType: 'L', bookingTypeTh: 'จองระยะยาว', bookingTypeEn: 'Long' },
];
const PAYMENT_TYPES = [
  {
    paymentType: 'F',
    paymentTypeTh: 'ชำระเต็มจำนวน',
    paymentTypeEn: 'Full Payment',
  },
  {
    paymentType: 'D',
    paymentTypeTh: 'ชำระวันต่อวัน',
    paymentTypeEn: 'Daily Payment',
  },
];
const PAYMENT_STATUSES = [
  { paymentStatus: 'W', paymentStatusTh: 'รอชำระ', paymentStatusEn: 'Waiting' },
  { paymentStatus: 'P', paymentStatusTh: 'ชำระแล้ว', paymentStatusEn: 'Paid' },
  {
    paymentStatus: 'O',
    paymentStatusTh: 'เกินกำหนดชำระ',
    paymentStatusEn: 'Overdue',
  },
  {
    paymentStatus: 'C',
    paymentStatusTh: 'ถูกยกเลิก',
    paymentStatusEn: 'Cancel',
  },
];
const BOOKING_STATUSES = [
  { bookingStatus: 'A', bookingTh: 'ปกติ', bookingEn: 'Active' },
  { bookingStatus: 'C', bookingTh: 'ยกเลิก', bookingEn: 'Cancel' },
];
const COLORS = [
  {
    colorCode: 'G',
    colorTh: 'เขียว',
    colorEn: 'Green',
    description: 'ช่องจอดว่าง(Available)',
    htmlColorCode: '#008000',
  },
  {
    colorCode: 'R',
    colorTh: 'แดง',
    colorEn: 'Red',
    description: 'ช่องจอดไม่ว่าง / มีรถจอด (Occupied)',
    htmlColorCode: '#dc143c',
  },
  {
    colorCode: 'B',
    colorTh: 'ดำ',
    colorEn: 'Black',
    description: 'ช่องจอดปิดใช้งาน (Closed)',
    htmlColorCode: '#000000',
  },
  {
    colorCode: 'Y',
    colorTh: 'เหลือง',
    colorEn: 'Yellow',
    description: 'ช่องจอดหมดเวลาบริการ (Overtime)',
    htmlColorCode: '#FFFF00',
  },
  {
    colorCode: 'S',
    colorTh: 'ฟ้า',
    colorEn: 'Sky Blue',
    description: 'ช่องจอดที่จัดสรร/สงวนสิทธิ์ (Reserved)',
    htmlColorCode: '#87CEEB',
  },
];
// คำอธิบายกลุ่มตาม Master data พ.ย. 2569
const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  'General User': 'ผู้ใช้งานทั่วไป',
  'Admin Staff': 'พนักงาน (ฝ่ายบริการลูกค้า) นำเข้าข้อมูลจองให้ลูกค้าประจำ',
  'Admin Manager': 'ผู้จัดการ ฝ่ายบริการลูกค้า',
  'IT Master': 'พนักงานฝ่าย IT ที่มีสิทธิ์ตั้งค่าในระบบ',
  'Operation Inspector':
    'ผู้ตรวจสอบหน้างาน ตรวจสอบการใช้ช่องจอด/บันทึกการค่าปรับ',
  'Operation Manager':
    'ผู้จัดการงานปฏิบัติการ สำหรับอนุมัติ/ยกเลิกรายการที่เกี่ยวข้องกับการตรวจสอบหน้างาน',
  'Executive Viewer': 'ผู้บริหารสำหรับดูข้อมูล',
  CRM: 'ผู้ขอใช้บริการ',
};
// สถานะช่องจอด (Master data: ParkingSlotStatus)
const SLOT_STATUSES = [
  ['AVAILABLE', 'ว่าง', 'ช่องจอดว่าง(Available)', 'เขียว', 'Green', '#008000'],
  [
    'OCCUPIED',
    'ไม่ว่าง',
    'ช่องจอดไม่ว่าง / มีรถจอด (Occupied)',
    'แดง',
    'Red',
    '#dc143c',
  ],
  [
    'CLOSED',
    'ปิดใช้งาน',
    'ช่องจอดปิดใช้งาน (Closed)',
    'ดำ',
    'Black',
    '#000000',
  ],
  [
    'OVERTIME',
    'หมดเวลา',
    'ช่องจอดหมดเวลาบริการ (Overtime)',
    'เหลือง',
    'Yellow',
    '#FFFF00',
  ],
  [
    'RESERVED',
    'สงวนสิทธิ์',
    'ช่องจอดที่จัดสรร/สงวนสิทธิ์ (Reserved)',
    'ฟ้า',
    'Sky Blue',
    '#87CEEB',
  ],
] as const;
// เมนูย่อย (Master data: Menu_Sub_Groups) [ชื่อไทย, ชื่ออังกฤษ, ลำดับเมนูหลัก]
const SUB_MENUS = [
  ['บันทึกค่าปรับ', 'Fine Entry', 7],
  ['รายการ Blacklist', 'Blacklist', 7],
  ['รายงานข้อมูลการจอง', 'Booking Report', 8],
  ['รายงานสรุปยอดการชำระเงิน', 'Payment Report', 8],
  ['รายงานข้อมูลค่าปรับ', 'Fine Report', 8],
  ['รายชื่อผู้ใช้งาน(พนักงาน)/จัดการกลุ่มสิทธิ์ผู้ใช้งาน', 'Employee', 11],
  ['รายชื่อผู้ขอใช้บริการ', 'CRMCustomer', 11],
  ['กำหนดสิทธิ์สำหรับกลุ่มผู้ใช้งาน', 'Group Permissions', 11],
  ['Matrix สิทธิ์ตามกลุ่มผู้ใช้งาน', 'Permission Matrix', 11],
] as const;
const PERMISSION_NAMES: Record<string, string> = {
  BOOKING_CREATE_SELF: 'จองช่องจอดด้วยตนเอง',
  BOOKING_CREATE_ON_BEHALF: 'จองแทนผู้ขอใช้บริการ',
  BOOKING_IMPORT_LONG_TERM: 'นำเข้าข้อมูลจอง (ลูกค้าประจำ)',
  LAYOUT_TOGGLE: 'เปิด/ปิดช่องจอด',
  LAYOUT_EDIT: 'แก้ไขผังลานจอด',
  PRICING_MANAGE: 'กำหนดราคา',
  SLOT_INSPECT: 'ตรวจสอบลานจอด',
  REPORT_VIEW: 'ดูรายงาน',
  SETTINGS_MANAGE: 'ตั้งค่าระบบ',
};
const MENUS = [
  ['ตารางการจอง', 'Calendar'],
  ['จองช่องจอด', 'Booking'],
  ['นำเข้าข้อมูลจอง(ลูกค้าประจำ)', 'ImportFile'],
  ['รายการจอง/ค่าปรับ', 'Booking&Fine'],
  ['รายการรอชำระเงิน', 'PendingPayment'],
  ['ตรวจสอบลานจอด', 'Parking'],
  ['ค่าปรับ', 'Fine'],
  ['รายงาน', 'Report'],
  ['แดชบอร์ด', 'Dashboard'],
  ['คู่มือการใช้งาน', 'Manual'],
  ['ตั้งค่าระบบ', 'Setting'],
];
const NOTIFICATION_SETTINGS = [
  {
    notiType: 'PAYMENT_DUE',
    notiNameTh: 'แจ้งเตือนชำระเงิน',
    recipientType: 'CUSTOMER',
    notiBeforeMinute: 30,
  },
  {
    notiType: 'PARKING_END_CUSTOMER',
    notiNameTh: 'แจ้งเตือนลูกค้าก่อนหมดเวลาใช้งานช่องจอด',
    recipientType: 'CUSTOMER',
    notiBeforeMinute: env.notifyBeforeMinutes,
  },
  {
    notiType: 'PARKING_END_INSPECTOR',
    notiNameTh: 'แจ้งเตือนผู้ตรวจสอบเมื่อหมดเวลาใช้งานช่องจอด',
    recipientType: 'EMPLOYEE',
    notiBeforeMinute: 0,
  },
];
const POLICIES = [
  { policyCode: 'ADVANCE_BOOKING_DAY', policyValue: 7, unit: 'day' },
];

// ───────── บัญชีทดสอบ ─────────
// ตรงกับปุ่ม "เข้าสู่ระบบด่วน" ของ frontend (src/components/auth/dev-quick-login.tsx)
// ⚠️ ระบบทดสอบเท่านั้น — บน server จริงพนักงานมาจาก vwEmployee_List ของบริษัท และต้องลบลูกค้าตัวอย่าง
const DEMO_EMPLOYEE_PASSWORD = 'ycs-demo-1234';
const EMPLOYEES: {
  code: string;
  name: string;
  dept: string;
  role: RoleName;
}[] = [
  {
    code: 'CS001',
    name: 'วิไล พรหมมา',
    dept: 'ฝ่ายบริการลูกค้า',
    role: 'Admin Staff',
  },
  {
    code: 'YD001',
    name: 'ประเสริฐ ทองคำ',
    dept: 'ฝ่ายจัดพื้นที่',
    role: 'Operation Inspector',
  },
  { code: 'IT001', name: 'มาลี ศรีสุข', dept: 'ฝ่าย IT', role: 'IT Master' },
];
const DEMO_CUSTOMERS = [
  {
    cusType: 'buyer',
    telephone: '0800000001',
    firstName: 'ลูกค้า',
    lastName: '0001',
  },
  {
    cusType: 'Labor',
    telephone: '0800000002',
    laborCode: 'LB9001',
    firstName: 'ลูกค้า',
    lastName: '0002',
  },
];

async function seedMasters(prisma: PrismaClient): Promise<void> {
  for (const row of BOOKING_TYPES) {
    await prisma.bookingType.upsert({
      where: { bookingType: row.bookingType },
      update: {},
      create: { ...row, createdBy: SEED_BY },
    });
  }
  for (const row of PAYMENT_TYPES) {
    await prisma.paymentType.upsert({
      where: { paymentType: row.paymentType },
      update: {},
      create: { ...row, createdBy: SEED_BY },
    });
  }
  for (const row of PAYMENT_STATUSES) {
    await prisma.paymentStatus.upsert({
      where: { paymentStatus: row.paymentStatus },
      update: {},
      create: { ...row, createBy: SEED_BY },
    });
  }
  for (const row of BOOKING_STATUSES) {
    await prisma.bookingStatus.upsert({
      where: { bookingStatus: row.bookingStatus },
      update: {},
      create: { ...row, createBy: SEED_BY },
    });
  }
  for (const row of COLORS) {
    await prisma.colorsStatus.upsert({
      where: { colorCode: row.colorCode },
      update: {},
      create: { ...row, createBy: SEED_BY },
    });
  }
  for (const row of POLICIES) {
    await prisma.bookingPolicy.upsert({
      where: { policyCode: row.policyCode },
      update: {},
      create: { ...row, createBy: SEED_BY },
    });
  }
  if ((await prisma.notificationSetting.count()) === 0) {
    await prisma.notificationSetting.createMany({
      data: NOTIFICATION_SETTINGS.map((row) => ({
        ...row,
        effectiveDate: toDbDate(FIRST_EFFECTIVE_DATE),
        createBy: SEED_BY,
      })),
    });
  }
  for (const [
    code,
    nameTh,
    description,
    colorTh,
    colorEn,
    html,
  ] of SLOT_STATUSES) {
    await prisma.parkingSlotStatus.upsert({
      where: { statusCode: code },
      update: {},
      create: {
        statusCode: code,
        statusNameTh: nameTh,
        statusNameEn: code,
        description,
        colorTh,
        colorEn,
        htmlColorCode: html,
        createdBy: SEED_BY,
      },
    });
  }
  if ((await prisma.menu_Groups.count()) === 0) {
    await prisma.menu_Groups.createMany({
      data: MENUS.map(([th, en], index) => ({
        menuNameTh: th,
        menuNameEn: en,
        routePath: `/${en}`,
        sequenceNo: index + 1,
        createdBy: SEED_BY,
      })),
    });
  }
  // ฐานข้อมูลที่มีเมนูอยู่แล้ว: เติม Route_Path และชื่อตาม Master data ล่าสุด (จับคู่ด้วยลำดับเมนู)
  for (const [index, [th, en]] of MENUS.entries()) {
    await prisma.menu_Groups.updateMany({
      where: { sequenceNo: index + 1 },
      data: { menuNameTh: th, menuNameEn: en, routePath: `/${en}` },
    });
  }
  if ((await prisma.menu_Sub_Groups.count()) === 0) {
    const menus = await prisma.menu_Groups.findMany({
      select: { menuId: true, sequenceNo: true },
    });
    const menuIdOf = new Map(
      menus.map((menu) => [menu.sequenceNo, menu.menuId]),
    );
    let previousMenu = 0;
    let sequenceNo = 0;
    for (const [th, en, menuSequence] of SUB_MENUS) {
      sequenceNo = menuSequence === previousMenu ? sequenceNo + 1 : 1;
      previousMenu = menuSequence;
      const menuId = menuIdOf.get(menuSequence);
      if (menuId === undefined) continue;
      await prisma.menu_Sub_Groups.create({
        data: {
          menuSubNameTh: th,
          menuSubNameEn: en,
          sequenceNo,
          menuId,
          createdBy: SEED_BY,
        },
      });
    }
  }
}

// กลุ่มสิทธิ์ 6 กลุ่มตาม Master data + สิทธิ์ของแต่ละกลุ่ม [ชั่วคราว รอ SA ยืนยัน]
async function seedRoles(prisma: PrismaClient): Promise<Map<RoleName, bigint>> {
  const actions = new Map<string, bigint>();
  for (const code of PERMISSIONS) {
    const action = await prisma.permission_Actions.upsert({
      where: { actionCode: code },
      update: {},
      create: {
        actionCode: code,
        actionName: PERMISSION_NAMES[code],
        createdBy: SEED_BY,
      },
    });
    actions.set(code, action.actionId);
  }
  const roles = new Map<RoleName, bigint>();
  for (const name of ROLE_NAMES) {
    const existing = await prisma.roles.findFirst({
      where: { roleName: name },
    });
    const role =
      existing ??
      (await prisma.roles.create({
        data: {
          roleName: name,
          roleDescription: ROLE_DESCRIPTIONS[name],
          createdBy: SEED_BY,
        },
      }));
    roles.set(name, role.roleId);
    if (existing) {
      // คำอธิบายตาม Master data ล่าสุด (สิทธิ์เดิมของกลุ่มไม่แตะ — อาจถูกแก้จากหน้าจัดการสิทธิ์แล้ว)
      await prisma.roles.update({
        where: { roleId: role.roleId },
        data: { roleDescription: ROLE_DESCRIPTIONS[name] },
      });
      continue;
    }
    await prisma.role_Permission_Matrix.createMany({
      data: ROLE_PERMISSIONS[name].map((code) => ({
        roleId: role.roleId,
        actionId: actions.get(code) as bigint,
        createdBy: SEED_BY,
      })),
    });
  }
  return roles;
}

// ชุดรอบแรก (07:01 รอบละ 4 ชม.) + ลานจริง + เวอร์ชันผังแรกของแต่ละลาน
async function seedYard(prisma: PrismaClient): Promise<void> {
  if ((await prisma.bookingRound.count()) === 0) {
    await prisma.bookingRound.createMany({
      data: roundRows(DEFAULT_SCHEDULE).map((row) => ({
        ...row,
        roundNo: FIRST_ROUND_NO,
        effectiveDate: toDbDate(FIRST_EFFECTIVE_DATE),
        createBy: SEED_BY,
      })),
    });
  }
  for (const [lotIndex, lot] of REAL_LOTS.entries()) {
    const extra = await prisma.parkingExtra.findUnique({
      where: { code: lot.code },
    });
    const parkingId =
      extra?.parkingId ??
      (
        await prisma.parking.create({
          data: {
            parkingName: lot.name,
            createdBy: SEED_BY,
            extra: { create: { code: lot.code, sortOrder: lotIndex } },
          },
        })
      ).parkingId;
    const slotIds: bigint[] = [];
    for (const code of slotCodesOf(lot)) {
      const slot = await prisma.parkingSlot.upsert({
        where: { parkingId_slot: { parkingId, slot: code } },
        update: {},
        create: { parkingId, slot: code, createdBy: SEED_BY },
      });
      slotIds.push(slot.parkingSlotId);
    }
    const version = await prisma.parkingLayoutVersion.findFirst({
      where: { parkingId },
    });
    if (version) continue;
    await prisma.parkingLayoutVersion.create({
      data: {
        parkingId,
        roundNo: FIRST_ROUND_NO,
        versionNo: 'V1',
        effectiveDate: toDbDate(FIRST_EFFECTIVE_DATE),
        createdBy: SEED_BY,
        rates: {
          create: { rateAmount: env.pricePerSlotRound, createdBy: SEED_BY },
        },
      },
    });
  }
}

async function seedAccounts(
  prisma: PrismaClient,
  roles: Map<RoleName, bigint>,
): Promise<void> {
  const password = hashPassword(DEMO_EMPLOYEE_PASSWORD);
  for (const employee of EMPLOYEES) {
    // ข้อมูลพนักงานจำลองแทน view ของบริษัท — ปุ่มเข้าสู่ระบบด่วนใช้รหัสผ่านทดสอบ จึงตั้งกลับทุกครั้ง
    await prisma.employeeView.upsert({
      where: { empCode: employee.code },
      update: { password },
      create: {
        empCode: employee.code,
        username: employee.code,
        password,
        empName: employee.name,
        deptName: employee.dept,
        empStatus: 'A',
      },
    });
    const roleId = roles.get(employee.role) as bigint;
    await prisma.accounts_Roles.upsert({
      where: { empCode_roleId: { empCode: employee.code, roleId } },
      update: {},
      create: { empCode: employee.code, roleId, createdBy: SEED_BY },
    });
  }
  for (const [index, customer] of DEMO_CUSTOMERS.entries()) {
    await prisma.cRMCustomer.upsert({
      where: { telephone: customer.telephone },
      update: {},
      create: {
        ...customer,
        cusId: formatCusId(index + 1),
        createdBy: SEED_BY,
      },
    });
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaMssql(env.databaseUrl),
});
try {
  await seedMasters(prisma);
  const roles = await seedRoles(prisma);
  // ผู้รับแจ้งเตือนรถหมดเวลา = กลุ่มผู้ตรวจสอบหน้างาน (NotificationSetting.RoleID ตาม Data Dictionary)
  await prisma.notificationSetting.updateMany({
    where: { notiType: 'PARKING_END_INSPECTOR', roleId: null },
    data: { roleId: roles.get('Operation Inspector') },
  });
  await seedYard(prisma);
  await seedAccounts(prisma, roles);
} finally {
  await prisma.$disconnect();
}
