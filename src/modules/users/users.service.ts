import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../../common/api-exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { isEmployeeActive } from '../auth/auth.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { isPermission, type Permission } from '../auth/domain/permissions.js';
import { planRoleChange } from './domain/role-change.js';
import type { UpdateRolesDto } from './dto/update-roles.dto.js';

export type RoleView = {
  id: number;
  name: string;
  description: string | null;
  permissions: Permission[];
};

export type EmployeeView = {
  id: string; // EmpCode
  employeeCode: string;
  name: string;
  department: string | null; // ชื่อฝ่ายจากข้อมูลพนักงานของบริษัท
  position: string | null;
  isActive: boolean; // ยังทำงานอยู่ (EmpStatus)
  roleIds: number[];
  permissions: Permission[];
};

const ROLE_WITH_PERMISSIONS = {
  permissions: { include: { action: true } },
} as const;

// ข้อ 2: พนักงานมาจาก vwEmployee_List ของบริษัท — ระบบนี้กำหนดได้แค่กลุ่มสิทธิ์ (Accounts_Roles)
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listRoles(): Promise<RoleView[]> {
    const roles = await this.prisma.roles.findMany({
      where: { isActive: true },
      include: ROLE_WITH_PERMISSIONS,
      orderBy: { roleId: 'asc' },
    });
    return roles.map((role) => ({
      id: Number(role.roleId),
      name: role.roleName,
      description: role.roleDescription,
      permissions: role.permissions
        .map((item) => item.action.actionCode)
        .filter(isPermission),
    }));
  }

  // พนักงานที่มีกลุ่มสิทธิ์อยู่แล้ว + ค้นพนักงานอื่นด้วยชื่อหรือรหัส (q) เพื่อกำหนดกลุ่มสิทธิ์ให้
  async listEmployees(q?: string): Promise<EmployeeView[]> {
    const search = q?.trim();
    const accounts = await this.prisma.accounts_Roles.findMany({
      include: { role: { include: ROLE_WITH_PERMISSIONS } },
    });
    const withRoles = [...new Set(accounts.map((account) => account.empCode))];
    const employees = await this.prisma.employeeView.findMany({
      where: search
        ? {
            OR: [
              { empName: { contains: search } },
              { empCode: { contains: search } },
            ],
          }
        : { empCode: { in: withRoles } },
      orderBy: { empCode: 'asc' },
      take: search ? 50 : undefined,
    });
    return employees.map((employee) => {
      const mine = accounts.filter(
        (account) => account.empCode === employee.empCode,
      );
      const permissions = new Set<Permission>();
      for (const account of mine) {
        for (const item of account.role.permissions) {
          if (isPermission(item.action.actionCode)) {
            permissions.add(item.action.actionCode);
          }
        }
      }
      return {
        id: employee.empCode,
        employeeCode: employee.empCode,
        name: employee.empName,
        department: employee.deptName,
        position: employee.empPosition,
        isActive: isEmployeeActive(employee.empStatus),
        roleIds: mine.map((account) => Number(account.roleId)),
        permissions: [...permissions],
      };
    });
  }

  async updateRoles(
    actor: AuthUser,
    empCode: string,
    dto: UpdateRolesDto,
  ): Promise<EmployeeView> {
    const employee = await this.prisma.employeeView.findUnique({
      where: { empCode },
    });
    if (!employee) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'RECORD_NOT_FOUND',
        'Employee not found',
      );
    }
    const [allRoles, current] = await Promise.all([
      this.prisma.roles.findMany({ where: { isActive: true } }),
      this.prisma.accounts_Roles.findMany({ where: { empCode } }),
    ]);
    const plan = planRoleChange({
      targetCode: empCode,
      actorCode: actor.id,
      allRoles,
      current: current.map((account) => account.roleId),
      wanted: dto.roleIds.map((id) => BigInt(id)),
    });
    if (!plan.ok) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        plan.error,
        plan.error === 'ROLE_NOT_FOUND'
          ? 'A role does not exist'
          : 'You cannot remove your own settings permission',
      );
    }

    await this.prisma.$transaction([
      this.prisma.accounts_Roles.deleteMany({
        where: { empCode, roleId: { in: plan.revoke } },
      }),
      this.prisma.accounts_Roles.createMany({
        data: plan.grant.map((roleId) => ({
          empCode,
          roleId,
          createdBy: actor.id,
        })),
      }),
    ]);
    if (plan.grant.length > 0 || plan.revoke.length > 0) {
      await this.audit.record({
        actor: actor.id,
        action: 'ROLE_UPDATE',
        entity: 'employee',
        entityId: empCode,
        detail: {
          grant: plan.grant.map(Number),
          revoke: plan.revoke.map(Number),
        },
      });
    }
    const [view] = await this.listEmployees(empCode);
    return view;
  }
}
