import type { PrismaService } from '../prisma/prisma.service.js';
import { customerName } from '../modules/auth/domain/customer.js';

export type Person = { name: string; employeeCode: string | null };

// ชื่อของผู้ทำรายการจากรหัส: รหัสพนักงาน (vwEmployee_List) หรือรหัสผู้ขอใช้บริการ (CRMCustomer)
// ใช้กับคอลัมน์ CreatedBy / UpdatedBy / IssuedBy ที่เก็บเป็นรหัส
export async function loadPeople(
  prisma: PrismaService,
  codes: (string | null | undefined)[],
): Promise<Map<string, Person>> {
  const unique = [...new Set(codes.filter((code): code is string => !!code))];
  const people = new Map<string, Person>();
  if (unique.length === 0) return people;
  const [employees, customers] = await Promise.all([
    prisma.employeeView.findMany({
      where: { empCode: { in: unique } },
      select: { empCode: true, empName: true },
    }),
    prisma.cRMCustomer.findMany({
      where: { cusId: { in: unique } },
      select: { cusId: true, firstName: true, lastName: true },
    }),
  ]);
  for (const customer of customers) {
    people.set(customer.cusId, {
      name: customerName(customer),
      employeeCode: null,
    });
  }
  for (const employee of employees) {
    people.set(employee.empCode, {
      name: employee.empName,
      employeeCode: employee.empCode,
    });
  }
  return people;
}
