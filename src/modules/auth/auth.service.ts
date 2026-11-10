import { HttpStatus, Injectable } from '@nestjs/common';
import type { CRMCustomer } from '@prisma/client';
import { ApiException } from '../../common/api-exception.js';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CrmClient } from '../crm/crm.client.js';
import type { AuthUser } from './auth.types.js';
import {
  customerName,
  cusTypeOf,
  formatSubject,
  nextCusId,
  parseSubject,
  splitName,
  userTypeOf,
} from './domain/customer.js';
import { afterFailedLogin, isLocked } from './domain/login-lockout.js';
import {
  CUSTOMER_PERMISSIONS,
  isPermission,
  type Permission,
  type UserType,
} from './domain/permissions.js';
import { verifyPassword } from './domain/password.js';
import { departmentOfRoles } from './domain/roles.js';
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
  id: string;
  name: string;
  phone: string | null;
  userType: UserType;
};

export const SESSION_COOKIE = 'ycs_session';

// สถานะพนักงานใน vwEmployee_List ที่ถือว่าลาออก/พักงาน — [รอ] ค่าจริงจากระบบพนักงานของบริษัท
const INACTIVE_EMP_STATUS = ['I', 'INACTIVE', 'RESIGN'];

export function isEmployeeActive(empStatus: string | null): boolean {
  return !INACTIVE_EMP_STATUS.includes((empStatus ?? '').toUpperCase());
}

export function toCustomerUser(customer: CRMCustomer): AuthUser {
  const type = userTypeOf(customer.cusType);
  return {
    id: customer.cusId,
    name: customerName(customer),
    type,
    department: null,
    phone: customer.telephone,
    laborCardNo: type === 'GREEN_SHIRT' ? customer.laborCode : null,
    employeeCode: null,
    permissions: CUSTOMER_PERMISSIONS,
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

// ใส่รหัสผิดติดกันหลายครั้ง: บอกเวลาที่ลองใหม่ได้ (details[0] เป็นเวลา ISO ให้หน้าเว็บแสดง)
function accountLocked(until: Date | null): ApiException {
  return new ApiException(
    HttpStatus.LOCKED,
    'AUTH_ACCOUNT_LOCKED',
    'Too many wrong passwords; try again later',
    until ? [until.toISOString()] : undefined,
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

function typeMismatch(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    'CUSTOMER_TYPE_MISMATCH',
    'This phone number is registered as another customer type',
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
        ? await this.loginEmployee(dto)
        : await this.loginCustomer(dto);
    if (!user) throw invalidCredentials();

    await this.audit.record({
      actor: user.id,
      action: 'LOGIN',
      entity: 'user',
      entityId: user.id,
    });
    const subject = formatSubject({
      kind: user.type === 'EMPLOYEE' ? 'EMPLOYEE' : 'CUSTOMER',
      code: user.id,
    });
    const token = createSessionToken(
      subject,
      env.authSecret,
      env.sessionTtlHours,
      new Date(),
    );
    return { user, token };
  }

  // พนักงาน: ข้อมูลจาก vwEmployee_List ของบริษัท สิทธิ์จาก Accounts_Roles
  // [รอ] รูปแบบ Password ใน view จริง — ตอนนี้ตรวจแบบ hash ของ YCS (ใช้กับ view จำลองบนเครื่อง dev)
  private async loginEmployee(dto: LoginDto): Promise<AuthUser | null> {
    if (!dto.employeeCode || !dto.password) return null;
    const empCode = dto.employeeCode.trim().toUpperCase();
    const employee = await this.prisma.employeeView.findUnique({
      where: { empCode },
    });
    if (!employee) return null;

    const now = new Date();
    const attempt = await this.prisma.loginAttempt.findUnique({
      where: { loginKey: empCode },
    });
    const state = {
      failedLogins: attempt?.failedLogins ?? 0,
      lockedUntil: attempt?.lockedUntil ?? null,
    };
    if (isLocked(state, now)) throw accountLocked(state.lockedUntil);

    if (!verifyPassword(dto.password, employee.password)) {
      const next = afterFailedLogin(state, now);
      await this.prisma.loginAttempt.upsert({
        where: { loginKey: empCode },
        create: { loginKey: empCode, ...next },
        update: next,
      });
      if (next.lockedUntil) {
        await this.audit.record({
          actor: empCode,
          action: 'ACCOUNT_LOCKED',
          entity: 'user',
          entityId: empCode,
        });
        throw accountLocked(next.lockedUntil);
      }
      return null;
    }
    if (attempt && (attempt.failedLogins > 0 || attempt.lockedUntil)) {
      await this.prisma.loginAttempt.update({
        where: { loginKey: empCode },
        data: { failedLogins: 0, lockedUntil: null },
      });
    }
    return this.loadEmployee(empCode);
  }

  // พนักงานที่ใช้ระบบได้ = ยังทำงานอยู่ และมีกลุ่มสิทธิ์ใน Accounts_Roles อย่างน้อย 1 กลุ่ม
  async loadEmployee(empCode: string): Promise<AuthUser | null> {
    const [employee, accounts] = await Promise.all([
      this.prisma.employeeView.findUnique({ where: { empCode } }),
      this.prisma.accounts_Roles.findMany({
        where: { empCode, role: { isActive: true } },
        include: {
          role: {
            include: {
              permissions: {
                where: { action: { isActive: true } },
                include: { action: true },
              },
            },
          },
        },
      }),
    ]);
    if (!employee || !isEmployeeActive(employee.empStatus)) return null;
    if (accounts.length === 0) return null;

    const permissions = new Set<Permission>();
    for (const account of accounts) {
      for (const item of account.role.permissions) {
        if (isPermission(item.action.actionCode)) {
          permissions.add(item.action.actionCode);
        }
      }
    }
    return {
      id: employee.empCode,
      name: employee.empName,
      type: 'EMPLOYEE',
      department: departmentOfRoles(
        accounts.map((account) => account.role.roleName),
      ),
      phone: null,
      laborCardNo: null,
      employeeCode: employee.empCode,
      permissions: [...permissions],
    };
  }

  private async loginCustomer(dto: LoginDto): Promise<AuthUser | null> {
    const laborCardNo =
      dto.userType === 'GREEN_SHIRT' ? dto.laborCardNo?.trim() : undefined;
    if (!dto.phone || (dto.userType === 'GREEN_SHIRT' && !laborCardNo)) {
      return null;
    }
    const customer = await this.syncCustomerFromCrm(
      dto.userType,
      dto.phone,
      laborCardNo,
      null,
    );
    if (!customer || !customer.isActive) return null;
    return toCustomerUser(customer);
  }

  // Workflow ข้อ 1: ผู้ขอใช้บริการถูกตรวจกับ CRM ทุกครั้งที่เข้าสู่ระบบ
  // ไม่พบใน CRM = เข้าไม่ได้; พบแล้วเพิ่มหรืออัปเดต CRMCustomer ให้ตรงกับ CRM
  // null = เบอร์นี้เปิดสิทธิ์ไว้เป็นผู้ใช้อีกประเภท — ไม่สลับประเภทให้เอง
  // TODO: [ถาม ข้อ 2] ยืนยันตัวด้วยเบอร์โทรอย่างเดียวตามเอกสาร ยังไม่มี OTP
  private async syncCustomerFromCrm(
    userType: UserType,
    phone: string,
    laborCardNo: string | undefined,
    actor: string | null,
  ): Promise<CRMCustomer | null> {
    const crmCustomer = await this.crm.findCustomer({ phone, laborCardNo });
    if (!crmCustomer) throw notInCrm();
    const cusType = cusTypeOf(userType);
    const name = splitName(crmCustomer.fullName);

    const existing = await this.prisma.cRMCustomer.findUnique({
      where: { telephone: phone },
    });
    if (!existing) {
      const created = await this.createCustomer({
        cusType,
        telephone: phone,
        laborCode: laborCardNo ?? null,
        ...name,
        createdBy: actor,
      });
      await this.audit.record({
        actor: actor ?? created.cusId,
        action: 'REGISTER',
        entity: 'customer',
        entityId: created.cusId,
      });
      return created;
    }
    if (existing.cusType !== cusType) return null;

    const upToDate =
      existing.firstName === name.firstName &&
      existing.lastName === name.lastName &&
      (existing.laborCode ?? undefined) === laborCardNo;
    if (upToDate) return existing;
    return this.prisma.cRMCustomer.update({
      where: { id: existing.id },
      data: {
        ...name,
        laborCode: laborCardNo ?? null,
        updatedBy: actor ?? existing.cusId,
        updatedDate: new Date(),
      },
    });
  }

  // CusId รันต่อจากรหัสล่าสุด (C00001) — ล็อกแถวล่าสุดไว้ กันสองคำขอได้รหัสเดียวกัน
  private createCustomer(data: {
    cusType: string;
    telephone: string;
    laborCode: string | null;
    firstName: string;
    lastName: string | null;
    createdBy: string | null;
  }): Promise<CRMCustomer> {
    return this.prisma.$transaction(async (tx) => {
      const [last] = await tx.$queryRaw<{ CusId: string }[]>`
        SELECT TOP 1 CusId FROM CRMCustomer WITH (UPDLOCK, HOLDLOCK)
        ORDER BY CusId DESC`;
      const cusId = nextCusId(last?.CusId ?? null);
      return tx.cRMCustomer.create({
        data: { ...data, cusId, createdBy: data.createdBy ?? cusId },
      });
    });
  }

  // Workflow ข้อ 3 / Screen Design "จองแทน": ฝ่ายบริการลูกค้ากด "ตรวจสอบข้อมูล" ด้วยประเภทลูกค้า + บัตรแรงงาน/เบอร์โทร
  // ตรวจกับ CRM แบบเดียวกับตอนลูกค้าเข้าสู่ระบบ — พบแล้วเพิ่ม/อัปเดตให้ จองแทนได้แม้ลูกค้าไม่เคยเข้าสู่ระบบ
  async verifyCustomer(
    actor: AuthUser,
    dto: VerifyCustomerDto,
  ): Promise<VerifiedCustomer> {
    const laborCardNo = dto.laborCardNo?.trim();
    if (dto.userType === 'GREEN_SHIRT' && !laborCardNo) {
      throw laborCardRequired();
    }
    const customer = await this.syncCustomerFromCrm(
      dto.userType,
      dto.phone,
      dto.userType === 'GREEN_SHIRT' ? laborCardNo : undefined,
      actor.id,
    );
    // เบอร์นี้เปิดสิทธิ์ไว้เป็นผู้ใช้อีกประเภท — ให้เจ้าหน้าที่เลือกประเภทให้ถูก ไม่สลับให้เอง
    if (!customer) throw typeMismatch();
    if (!customer.isActive) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CUSTOMER_INACTIVE',
        'This customer account is disabled',
      );
    }
    await this.audit.record({
      actor: actor.id,
      action: 'CUSTOMER_VERIFY',
      entity: 'customer',
      entityId: customer.cusId,
    });
    return {
      id: customer.cusId,
      name: customerName(customer),
      phone: customer.telephone,
      userType: userTypeOf(customer.cusType),
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

    const existing = await this.prisma.cRMCustomer.findUnique({
      where: { telephone: dto.phone },
    });
    // เปิดสิทธิ์ไว้เป็นอีกประเภท: บอกให้เลือกประเภทให้ถูก — "ลงทะเบียนแล้ว เข้าสู่ระบบได้เลย" จะพาไปเข้าแท็บเดิมแล้วเข้าไม่ได้
    if (existing && existing.cusType !== cusTypeOf(dto.userType)) {
      throw typeMismatch();
    }
    if (existing) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'REGISTER_ALREADY_EXISTS',
        'This customer is already registered',
      );
    }
    await this.syncCustomerFromCrm(dto.userType, dto.phone, laborCardNo, null);
  }

  async findUserByToken(token: string | undefined): Promise<AuthUser | null> {
    const text = verifySessionToken(token, env.authSecret, new Date());
    const subject = text === null ? null : parseSubject(text);
    if (!subject) return null;
    if (subject.kind === 'EMPLOYEE') return this.loadEmployee(subject.code);
    const customer = await this.prisma.cRMCustomer.findUnique({
      where: { cusId: subject.code },
    });
    return customer?.isActive ? toCustomerUser(customer) : null;
  }
}
