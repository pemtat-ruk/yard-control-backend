import { HttpStatus, Injectable } from '@nestjs/common';
import type { Permission as DbPermission, User } from '@prisma/client';
import { ApiException } from '../../common/api-exception.js';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CrmClient } from '../crm/crm.client.js';
import type { AuthUser } from './auth.types.js';
import { verifyPassword } from './domain/password.js';
import {
  createSessionToken,
  verifySessionToken,
} from './domain/session-token.js';
import type {
  LoginDto,
  RegisterDto,
  VerifyCustomerDto,
} from './dto/auth.dto.js';

// ผู้ขอใช้บริการที่ฝ่ายบริการลูกค้าจองแทนได้ (รูปเดียวกับผลค้นหาใน GET /bookings/customers)
export type VerifiedCustomer = {
  id: number;
  name: string;
  phone: string | null;
  userType: User['type'];
};

export const SESSION_COOKIE = 'ycs_session';

type UserWithPermissions = User & {
  permissions: { permission: DbPermission }[];
};

const WITH_PERMISSIONS = { permissions: { select: { permission: true } } };

function toAuthUser(user: UserWithPermissions): AuthUser {
  return {
    id: user.id,
    name: user.fullName,
    type: user.type,
    department: user.department,
    phone: user.phone,
    laborCardNo: user.laborCardNo,
    employeeCode: user.employeeCode,
    permissions: user.permissions.map((item) => item.permission),
  };
}

// ข้อความเดียวกันทุกกรณี ไม่บอกว่าผิดที่ช่องไหนหรือบัญชีมีอยู่หรือไม่
function invalidCredentials(): ApiException {
  return new ApiException(
    HttpStatus.UNAUTHORIZED,
    'AUTH_INVALID_CREDENTIALS',
    'Invalid credentials',
  );
}

function laborCardRequired(): ApiException {
  return new ApiException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_FAILED',
    'Request body is invalid',
    ['laborCardNo is required for green-shirt workers'],
  );
}

function notInCrm(): ApiException {
  return new ApiException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'REGISTER_NOT_IN_CRM',
    'No matching customer record in CRM',
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmClient,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto): Promise<{ user: AuthUser; token: string }> {
    const user =
      dto.userType === 'EMPLOYEE'
        ? await this.findEmployee(dto)
        : await this.syncCustomerFromCrm(dto);
    if (!user || !user.isActive) throw invalidCredentials();

    await this.audit.record({
      userId: user.id,
      action: 'LOGIN',
      entity: 'user',
      entityId: user.id,
    });
    const token = createSessionToken(
      user.id,
      env.authSecret,
      env.sessionTtlHours,
      new Date(),
    );
    return { user: toAuthUser(user), token };
  }

  private async findEmployee(
    dto: LoginDto,
  ): Promise<UserWithPermissions | null> {
    if (!dto.employeeCode || !dto.password) return null;
    const employee = await this.prisma.user.findUnique({
      where: { employeeCode: dto.employeeCode.trim().toUpperCase() },
      include: WITH_PERMISSIONS,
    });
    // TODO: [ถาม ข้อ 3] ตอนนี้ตรวจกับรหัสผ่านที่เก็บใน YCS เอง รอคำตอบว่าต้องต่อ AD / HR หรือไม่
    const matched =
      employee?.type === 'EMPLOYEE' &&
      verifyPassword(dto.password, employee.passwordHash);
    return matched ? employee : null;
  }

  // Workflow ข้อ 1: ผู้ขอใช้บริการถูกตรวจกับ CRM ทุกครั้งที่เข้าสู่ระบบ
  // ไม่พบใน CRM = เข้าไม่ได้; พบแล้วเพิ่มหรืออัปเดตข้อมูลใน YCS ให้ตรงกับ CRM
  // TODO: [ถาม ข้อ 2] ยืนยันตัวด้วยเบอร์โทรอย่างเดียวตามเอกสาร ยังไม่มี OTP
  private async syncCustomerFromCrm(
    dto: LoginDto,
  ): Promise<UserWithPermissions | null> {
    const laborCardNo =
      dto.userType === 'GREEN_SHIRT' ? dto.laborCardNo?.trim() : undefined;
    if (!dto.phone || (dto.userType === 'GREEN_SHIRT' && !laborCardNo)) {
      return null;
    }
    const crmCustomer = await this.crm.findCustomer({
      phone: dto.phone,
      laborCardNo,
    });
    if (!crmCustomer) throw notInCrm();

    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      include: WITH_PERMISSIONS,
    });
    if (!existing) {
      const created = await this.prisma.user.create({
        data: {
          type: dto.userType,
          phone: dto.phone,
          laborCardNo,
          crmId: crmCustomer.crmId,
          fullName: crmCustomer.fullName,
          permissions: { create: { permission: 'BOOKING_CREATE_SELF' } },
        },
        include: WITH_PERMISSIONS,
      });
      await this.audit.record({
        userId: created.id,
        action: 'REGISTER',
        entity: 'user',
        entityId: created.id,
      });
      return created;
    }
    // เบอร์นี้เปิดสิทธิ์ไว้เป็นผู้ใช้อีกประเภท — ไม่สลับประเภทให้เอง
    if (existing.type !== dto.userType) return null;

    const upToDate =
      existing.crmId === crmCustomer.crmId &&
      existing.fullName === crmCustomer.fullName &&
      (existing.laborCardNo ?? undefined) === laborCardNo;
    if (upToDate) return existing;
    return this.prisma.user.update({
      where: { id: existing.id },
      data: {
        crmId: crmCustomer.crmId,
        fullName: crmCustomer.fullName,
        laborCardNo: laborCardNo ?? null,
      },
      include: WITH_PERMISSIONS,
    });
  }

  // Workflow ข้อ 3 / Screen Design "จองแทน": ฝ่ายบริการลูกค้ากด "ตรวจสอบข้อมูล" ด้วยประเภทลูกค้า + บัตรแรงงาน/เบอร์โทร
  // ตรวจกับ CRM แบบเดียวกับตอนลูกค้าเข้าสู่ระบบ — พบแล้วเพิ่ม/อัปเดตใน YCS ให้ จองแทนได้แม้ลูกค้าไม่เคยเข้าสู่ระบบ
  async verifyCustomer(
    actor: AuthUser,
    dto: VerifyCustomerDto,
  ): Promise<VerifiedCustomer> {
    if (dto.userType === 'GREEN_SHIRT' && !dto.laborCardNo?.trim()) {
      throw laborCardRequired();
    }
    const customer = await this.syncCustomerFromCrm(dto);
    // เบอร์นี้เปิดสิทธิ์ไว้เป็นผู้ใช้อีกประเภท — ให้เจ้าหน้าที่เลือกประเภทให้ถูก ไม่สลับให้เอง
    if (!customer) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'CUSTOMER_TYPE_MISMATCH',
        'This phone number is registered as another customer type',
      );
    }
    if (!customer.isActive) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CUSTOMER_INACTIVE',
        'This customer account is disabled',
      );
    }
    await this.audit.record({
      userId: actor.id,
      action: 'CUSTOMER_VERIFY',
      entity: 'user',
      entityId: customer.id,
    });
    return {
      id: customer.id,
      name: customer.fullName,
      phone: customer.phone,
      userType: customer.type,
    };
  }

  // ข้อ 1: ต้องพบข้อมูลใน CRM ก่อน จึงเปิดสิทธิ์ใช้งานใน YCS
  async register(dto: RegisterDto): Promise<void> {
    const laborCardNo =
      dto.userType === 'GREEN_SHIRT' ? dto.laborCardNo?.trim() : undefined;
    if (dto.userType === 'GREEN_SHIRT' && !laborCardNo) {
      throw laborCardRequired();
    }

    const crmCustomer = await this.crm.findCustomer({
      phone: dto.phone,
      laborCardNo,
    });
    if (!crmCustomer) throw notInCrm();
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ phone: dto.phone }, { crmId: crmCustomer.crmId }] },
    });
    if (existing) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'REGISTER_ALREADY_EXISTS',
        'This customer is already registered',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        type: dto.userType,
        phone: dto.phone,
        laborCardNo,
        crmId: crmCustomer.crmId,
        fullName: crmCustomer.fullName,
        permissions: { create: { permission: 'BOOKING_CREATE_SELF' } },
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'REGISTER',
      entity: 'user',
      entityId: user.id,
    });
  }

  async findUserByToken(token: string | undefined): Promise<AuthUser | null> {
    const userId = verifySessionToken(token, env.authSecret, new Date());
    if (userId === null) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: WITH_PERMISSIONS,
    });
    return user?.isActive ? toAuthUser(user) : null;
  }
}
