import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { todayInBangkok, toDbDate } from './common/service-date.js';
import { env } from './config/env.js';
import { hashPassword } from './modules/auth/domain/password.js';
import {
  PERMISSION_ELIGIBILITY,
  type Department,
  type Permission,
} from './modules/auth/domain/permissions.js';

// ข้อมูลตั้งต้นสำหรับเครื่องพัฒนาและเซิร์ฟเวอร์ทดสอบ: npm run db:seed (รันซ้ำได้ ไม่สร้างซ้ำ ไม่เขียนทับของเดิม)
const SLOTS_PER_LOT = 12;
const LOTS = [
  { code: 'A', name: 'ลานจอด A' },
  { code: 'B', name: 'ลานจอด B' },
];
// ตำแหน่งช่อง (นับจาก 1) ที่ตั้งสถานะไว้ให้เห็นครบทุกสีบนผัง
const RESERVED_POSITIONS = [6, 11];
const CLOSED_POSITIONS = [9];
const DEMO_NAME_DIGITS = 4;

// บัญชีทดสอบ: ตรงกับปุ่ม "เข้าสู่ระบบด่วน" ของ frontend (src/components/auth/dev-quick-login.tsx)
// ⚠️ ระบบทดสอบเท่านั้น — ก่อนเปิดใช้งานจริงต้องเปลี่ยนรหัสผ่านพนักงานและลบลูกค้าตัวอย่าง
const DEMO_EMPLOYEE_PASSWORD = 'ycs-demo-1234';
const DEMO_CUSTOMERS = [
  { type: 'BUYER' as const, phone: '0800000001' },
  { type: 'GREEN_SHIRT' as const, phone: '0800000002', laborCardNo: 'LB9001' },
];

const EMPLOYEES: { code: string; name: string; department: Department }[] = [
  { code: 'CS001', name: 'วิไล พรหมมา', department: 'CUSTOMER_SERVICE' },
  { code: 'YD001', name: 'ประเสริฐ ทองคำ', department: 'YARD_MANAGEMENT' },
  { code: 'IT001', name: 'มาลี ศรีสุข', department: 'IT' },
];

function permissionsOf(department: Department): Permission[] {
  return (Object.keys(PERMISSION_ELIGIBILITY) as Permission[]).filter(
    (permission) => PERMISSION_ELIGIBILITY[permission].includes(department),
  );
}

async function seed(prisma: PrismaClient): Promise<void> {
  const passwordHash = hashPassword(DEMO_EMPLOYEE_PASSWORD);

  for (const [lotIndex, lot] of LOTS.entries()) {
    const saved = await prisma.parkingLot.upsert({
      where: { code: lot.code },
      update: {},
      create: { ...lot, sortOrder: lotIndex },
    });
    for (let position = 1; position <= SLOTS_PER_LOT; position++) {
      const code = `${lot.code}${String(position).padStart(2, '0')}`;
      await prisma.parkingSlot.upsert({
        where: { lotId_code: { lotId: saved.id, code } },
        update: {},
        create: {
          lotId: saved.id,
          code,
          gridCol: position,
          baseStatus: RESERVED_POSITIONS.includes(position)
            ? 'RESERVED'
            : CLOSED_POSITIONS.includes(position)
              ? 'CLOSED'
              : 'OPEN',
        },
      });
    }
  }

  let firstEmployeeId = 0;
  for (const employee of EMPLOYEES) {
    const saved = await prisma.user.upsert({
      where: { employeeCode: employee.code },
      // ปุ่มเข้าสู่ระบบด่วนใช้รหัสผ่านทดสอบ — ตั้งกลับทุกครั้ง เผื่อเคย seed ด้วยรหัสอื่น
      update: { passwordHash },
      create: {
        type: 'EMPLOYEE',
        department: employee.department,
        employeeCode: employee.code,
        fullName: employee.name,
        passwordHash,
        permissions: {
          create: permissionsOf(employee.department).map((permission) => ({
            permission,
          })),
        },
      },
    });
    firstEmployeeId ||= saved.id;
  }

  await seedDemoCustomers(prisma);

  if ((await prisma.rateConfig.count()) === 0) {
    await prisma.rateConfig.create({
      data: {
        pricePerSlotRound: env.pricePerSlotRound,
        effectiveFrom: toDbDate(todayInBangkok()),
        permitRef: 'SEED',
        createdById: firstEmployeeId,
      },
    });
  }
}

// ลูกค้าตัวอย่างแบบเดียวกับที่ลงทะเบียนผ่าน CRM จำลอง (ชื่อ "ลูกค้า" + เลข 4 ตัวท้าย, สิทธิ์จองเอง)
async function seedDemoCustomers(prisma: PrismaClient): Promise<void> {
  for (const customer of DEMO_CUSTOMERS) {
    await prisma.user.upsert({
      where: { phone: customer.phone },
      update: {},
      create: {
        ...customer,
        crmId: `MOCK-${customer.phone}`,
        fullName: `ลูกค้า ${customer.phone.slice(-DEMO_NAME_DIGITS)}`,
        permissions: { create: { permission: 'BOOKING_CREATE_SELF' } },
      },
    });
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.databaseUrl }),
});
try {
  await seed(prisma);
} finally {
  await prisma.$disconnect();
}
