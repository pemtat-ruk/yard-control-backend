import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { loadPeople } from '../../common/people.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditQueryDto } from './audit-query.dto.js';

const PAGE_SIZE = 50;

export type AuditView = {
  id: number;
  createdAt: string;
  action: string;
  entity: string;
  entityId: string | null;
  actor: { name: string; employeeCode: string | null } | null;
  detail: Prisma.JsonValue;
};

export type AuditEntry = {
  // รหัสผู้ทำรายการ: EmpCode หรือ CusId (null = ระบบทำเอง)
  actor: string | null;
  action: string;
  entity: string;
  entityId?: string | number;
  detail?: Prisma.InputJsonObject;
};

// SQL Server ไม่มีชนิด JSON จึงเก็บ detail เป็นข้อความ JSON
export function parseAuditDetail(text: string | null): Prisma.JsonValue {
  return text === null ? null : (JSON.parse(text) as Prisma.JsonValue);
}

// [เรา] บันทึกการกระทำที่ต้องตรวจย้อนหลังได้ (login, จองแทน, เปลี่ยนผัง, เปลี่ยนราคา, ค่าปรับ, ให้สิทธิ์)
// ห้ามใส่รหัสผ่าน เบอร์โทร หรือหมายเลขบัตรแรงงานใน detail
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorCode: entry.actor,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId?.toString(),
        detail: entry.detail && JSON.stringify(entry.detail),
      },
    });
  }

  // ใหม่สุดก่อน ทีละ PAGE_SIZE รายการ (โหลดต่อด้วย before)
  async list(query: AuditQueryDto): Promise<AuditView[]> {
    const actorCodes = await this.actorCodesMatching(query.q?.trim());
    if (actorCodes?.length === 0) return [];
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(query.action ? { action: query.action } : {}),
        ...(query.before ? { id: { lt: query.before } } : {}),
        ...(query.from || query.to
          ? {
              createdDate: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
        ...(actorCodes ? { actorCode: { in: actorCodes } } : {}),
      },
      orderBy: { id: 'desc' },
      take: PAGE_SIZE,
    });
    const people = await loadPeople(
      this.prisma,
      rows.map((row) => row.actorCode),
    );
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdDate.toISOString(),
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      actor: row.actorCode
        ? (people.get(row.actorCode) ?? {
            name: row.actorCode,
            employeeCode: null,
          })
        : null,
      detail: parseAuditDetail(row.detail),
    }));
  }

  // ค้นจากชื่อหรือรหัสพนักงาน — undefined = ไม่ได้ค้น
  private async actorCodesMatching(
    q: string | undefined,
  ): Promise<string[] | undefined> {
    if (!q) return undefined;
    const employees = await this.prisma.employeeView.findMany({
      where: {
        OR: [{ empName: { contains: q } }, { empCode: { contains: q } }],
      },
      select: { empCode: true },
    });
    return employees.map((employee) => employee.empCode);
  }
}
