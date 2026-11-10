import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { CrmClient, CrmCustomer } from '../crm/crm.client.js';
import type { AuthUser } from './auth.types.js';
import { AuthService } from './auth.service.js';

// Workflow ข้อ 1: ผู้ขอใช้บริการถูกตรวจกับ CRM ทุกครั้งที่เข้าสู่ระบบ — ข้อมูลอยู่ใน CRMCustomer
describe('AuthService.login for customers', () => {
  const phone = '0800000000';
  const crmCustomer: CrmCustomer = { crmId: 'CRM-1', fullName: 'สมชาย ใจดี' };
  const saved = {
    id: 7n,
    cusId: 'C00007',
    cusType: 'buyer',
    telephone: phone,
    laborCode: null,
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    isActive: true,
  };

  function setup(options: { inCrm: boolean; existing: object | null }) {
    const customer = {
      findUnique: vi.fn(() => Promise.resolve(options.existing)),
      create: vi.fn(() => Promise.resolve(saved)),
      update: vi.fn(() => Promise.resolve(saved)),
    };
    const prisma = {
      cRMCustomer: customer,
      $queryRaw: () => Promise.resolve([{ CusId: 'C00006' }]),
      $transaction: (work: (tx: unknown) => Promise<unknown>) => work(prisma),
    };
    const crm = {
      findCustomer: () => Promise.resolve(options.inCrm ? crmCustomer : null),
    };
    const audit = { record: vi.fn(() => Promise.resolve()) };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      crm as unknown as CrmClient,
      audit as unknown as AuditService,
    );
    return { service, customer };
  }

  it('refuses a customer who is not in CRM, without creating an account', async () => {
    const { service, customer } = setup({ inCrm: false, existing: null });
    await expect(
      service.login({ userType: 'BUYER', phone }),
    ).rejects.toMatchObject({ code: 'REGISTER_NOT_IN_CRM' });
    expect(customer.create).not.toHaveBeenCalled();
  });

  it('opens an account with the next customer code on first login', async () => {
    const { service, customer } = setup({ inCrm: true, existing: null });
    const result = await service.login({ userType: 'BUYER', phone });
    expect(customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cusId: 'C00007',
          cusType: 'buyer',
          firstName: 'สมชาย',
          lastName: 'ใจดี',
        }),
      }),
    );
    expect(result.user.id).toBe('C00007');
    expect(result.user.permissions).toEqual(['BOOKING_CREATE_SELF']);
    expect(result.token).toEqual(expect.any(String));
  });

  it('updates the saved profile when CRM data has changed', async () => {
    const { service, customer } = setup({
      inCrm: true,
      existing: { ...saved, firstName: 'ชื่อเก่า' },
    });
    await service.login({ userType: 'BUYER', phone });
    expect(customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: saved.id },
        data: expect.objectContaining({ firstName: 'สมชาย' }),
      }),
    );
  });

  it('leaves an up-to-date profile untouched', async () => {
    const { service, customer } = setup({ inCrm: true, existing: saved });
    await service.login({ userType: 'BUYER', phone });
    expect(customer.create).not.toHaveBeenCalled();
    expect(customer.update).not.toHaveBeenCalled();
  });

  it('does not switch an account to another customer type', async () => {
    const { service, customer } = setup({ inCrm: true, existing: saved });
    await expect(
      service.login({ userType: 'GREEN_SHIRT', phone, laborCardNo: 'LG1' }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    expect(customer.update).not.toHaveBeenCalled();
  });

  // Workflow ข้อ 3: ฝ่ายบริการลูกค้าตรวจ CRM ก่อนจองแทน
  describe('verifyCustomer (customer service books on behalf)', () => {
    const staff: AuthUser = {
      id: 'CS001',
      name: 'เจ้าหน้าที่',
      type: 'EMPLOYEE',
      department: 'CUSTOMER_SERVICE',
      phone: null,
      laborCardNo: null,
      employeeCode: 'CS001',
      permissions: ['BOOKING_CREATE_ON_BEHALF'],
    };

    it('opens an account for a CRM customer who has never signed in', async () => {
      const { service, customer } = setup({ inCrm: true, existing: null });
      const verified = await service.verifyCustomer(staff, {
        userType: 'BUYER',
        phone,
      });
      expect(customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdBy: 'CS001' }),
        }),
      );
      expect(verified).toEqual({
        id: 'C00007',
        name: crmCustomer.fullName,
        phone,
        userType: 'BUYER',
      });
    });

    it('refuses a customer who is not in CRM', async () => {
      const { service, customer } = setup({ inCrm: false, existing: null });
      await expect(
        service.verifyCustomer(staff, { userType: 'BUYER', phone }),
      ).rejects.toMatchObject({ code: 'REGISTER_NOT_IN_CRM' });
      expect(customer.create).not.toHaveBeenCalled();
    });

    it('asks for the labor card number of a green-shirt worker', async () => {
      const { service } = setup({ inCrm: true, existing: null });
      await expect(
        service.verifyCustomer(staff, { userType: 'GREEN_SHIRT', phone }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('tells staff when the phone belongs to another customer type', async () => {
      const { service } = setup({ inCrm: true, existing: saved });
      await expect(
        service.verifyCustomer(staff, {
          userType: 'GREEN_SHIRT',
          phone,
          laborCardNo: 'LG1',
        }),
      ).rejects.toMatchObject({ code: 'CUSTOMER_TYPE_MISMATCH' });
    });

    it('refuses a disabled customer account', async () => {
      const { service } = setup({
        inCrm: true,
        existing: { ...saved, isActive: false },
      });
      await expect(
        service.verifyCustomer(staff, { userType: 'BUYER', phone }),
      ).rejects.toMatchObject({ code: 'CUSTOMER_INACTIVE' });
    });
  });
});
