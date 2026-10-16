import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

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
}
