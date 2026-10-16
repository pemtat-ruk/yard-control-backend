import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../../common/api-exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { Department, Permission } from '../auth/domain/permissions.js';
import {
  grantablePermissions,
  planPermissionChange,
} from './domain/permission-change.js';
import type { UpdatePermissionsDto } from './dto/update-permissions.dto.js';

export type EmployeeView = {
  id: number;
  employeeCode: string | null;
  name: string;
  department: Department | null;
  isActive: boolean;
  permissions: Permission[];
  // สิทธิ์ที่ให้คนนี้ได้ตามฝ่าย (หน้าจอแสดงเฉพาะสิทธิ์เหล่านี้)
  grantable: Permission[];
};

const WITH_PERMISSIONS = { permissions: { select: { permission: true } } };

type EmployeeRow = {
  id: number;
  employeeCode: string | null;
  fullName: string;
  department: Department | null;
  isActive: boolean;
  permissions: { permission: Permission }[];
};

function toView(user: EmployeeRow): EmployeeView {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    name: user.fullName,
    department: user.department,
    isActive: user.isActive,
    permissions: user.permissions.map((item) => item.permission),
    grantable: grantablePermissions({
      type: 'EMPLOYEE',
      department: user.department,
    }),
  };
}

// ข้อ 2: ให้/ถอนสิทธิ์รายบุคคล ("เฉพาะคนที่ได้รับสิทธิ์") ภายในฝ่ายที่ถือสิทธิ์นั้นได้
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listEmployees(): Promise<EmployeeView[]> {
    const users = await this.prisma.user.findMany({
      where: { type: 'EMPLOYEE' },
      include: WITH_PERMISSIONS,
      orderBy: [{ department: 'asc' }, { employeeCode: 'asc' }],
    });
    return users.map(toView);
  }

  async updatePermissions(
    actor: AuthUser,
    id: number,
    dto: UpdatePermissionsDto,
  ): Promise<EmployeeView> {
    const user = await this.prisma.user.findFirst({
      where: { id, type: 'EMPLOYEE' },
      include: WITH_PERMISSIONS,
    });
    if (!user) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'RECORD_NOT_FOUND',
        'Employee not found',
      );
    }
    const plan = planPermissionChange({
      target: { id: user.id, type: 'EMPLOYEE', department: user.department },
      actorId: actor.id,
      current: user.permissions.map((item) => item.permission),
      wanted: dto.permissions,
    });
    if (!plan.ok) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        plan.error,
        plan.error === 'PERMISSION_NOT_ALLOWED'
          ? "A permission is outside this employee's department"
          : 'You cannot remove your own settings permission',
      );
    }

    await this.prisma.$transaction([
      this.prisma.userPermission.deleteMany({
        where: { userId: id, permission: { in: plan.revoke } },
      }),
      this.prisma.userPermission.createMany({
        data: plan.grant.map((permission) => ({
          userId: id,
          permission,
          grantedById: actor.id,
        })),
      }),
    ]);
    if (plan.grant.length > 0 || plan.revoke.length > 0) {
      await this.audit.record({
        userId: actor.id,
        action: 'PERMISSION_UPDATE',
        entity: 'user',
        entityId: id,
        detail: { grant: plan.grant, revoke: plan.revoke },
      });
    }

    const updated = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: WITH_PERMISSIONS,
    });
    return toView(updated);
  }
}
