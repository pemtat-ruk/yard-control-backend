import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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
  userId: number | null;
  action: string;
  entity: string;
  entityId?: string | number;
  detail?: Prisma.InputJsonObject;
};

// บันทึกการกระทำที่ต้องตรวจย้อนหลังได้ (login, จองแทน, เปลี่ยนผัง, เปลี่ยนราคา, ค่าปรับ, ให้สิทธิ์)
// ห้ามใส่รหัสผ่าน เบอร์โทร หรือหมายเลขบัตรแรงงานใน detail
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId?.toString(),
        detail: entry.detail,
      },
    });
  }

  // ใหม่สุดก่อน ทีละ PAGE_SIZE รายการ (โหลดต่อด้วย before)
  async list(query: AuditQueryDto): Promise<AuditView[]> {
    const q = query.q?.trim();
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(query.action ? { action: query.action } : {}),
        ...(query.before ? { id: { lt: query.before } } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
        ...(q
          ? {
              user: {
                OR: [
                  { fullName: { contains: q, mode: 'insensitive' } },
                  { employeeCode: { contains: q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: { user: { select: { fullName: true, employeeCode: true } } },
      orderBy: { id: 'desc' },
      take: PAGE_SIZE,
    });
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      actor: row.user
        ? { name: row.user.fullName, employeeCode: row.user.employeeCode }
        : null,
      detail: row.detail,
    }));
  }
}
