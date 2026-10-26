import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { CrmClient, CrmCustomer } from '../crm/crm.client.js';
import { AuthService } from './auth.service.js';

// Workflow ข้อ 1: ผู้ขอใช้บริการถูกตรวจกับ CRM ทุกครั้งที่เข้าสู่ระบบ
describe('AuthService.login for customers', () => {
  const phone = '0800000000';
  const crmCustomer: CrmCustomer = { crmId: 'CRM-1', fullName: 'สมชาย ใจดี' };
  const savedUser = {
    id: 7,
    type: 'BUYER',
    department: null,
    phone,
    laborCardNo: null,
    crmId: crmCustomer.crmId,
    fullName: crmCustomer.fullName,
    isActive: true,
    permissions: [{ permission: 'BOOKING_CREATE_SELF' }],
  };

  function setup(options: { inCrm: boolean; existing: object | null }) {
    const user = {
      findUnique: vi.fn(() => Promise.resolve(options.existing)),
      create: vi.fn(() => Promise.resolve(savedUser)),
      update: vi.fn(() => Promise.resolve(savedUser)),
    };
    const crm = {
      findCustomer: () => Promise.resolve(options.inCrm ? crmCustomer : null),
    };
    const audit = { record: vi.fn(() => Promise.resolve()) };
    const service = new AuthService(
      { user } as unknown as PrismaService,
      crm as unknown as CrmClient,
      audit as unknown as AuditService,
    );
    return { service, user };
  }

  it('refuses a customer who is not in CRM, without creating an account', async () => {
    const { service, user } = setup({ inCrm: false, existing: null });
    await expect(
      service.login({ userType: 'BUYER', phone }),
    ).rejects.toMatchObject({ code: 'REGISTER_NOT_IN_CRM' });
    expect(user.create).not.toHaveBeenCalled();
  });

  it('opens an account on first login when the customer is in CRM', async () => {
    const { service, user } = setup({ inCrm: true, existing: null });
    const result = await service.login({ userType: 'BUYER', phone });
    expect(user.create).toHaveBeenCalledTimes(1);
    expect(result.user.permissions).toEqual(['BOOKING_CREATE_SELF']);
    expect(result.token).toEqual(expect.any(String));
  });

  it('updates the saved profile when CRM data has changed', async () => {
    const { service, user } = setup({
      inCrm: true,
      existing: { ...savedUser, fullName: 'ชื่อเก่า' },
    });
    await service.login({ userType: 'BUYER', phone });
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: savedUser.id },
        data: expect.objectContaining({ fullName: crmCustomer.fullName }),
      }),
    );
  });

  it('leaves an up-to-date profile untouched', async () => {
    const { service, user } = setup({ inCrm: true, existing: savedUser });
    await service.login({ userType: 'BUYER', phone });
    expect(user.create).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
  });

  it('does not switch an account to another customer type', async () => {
    const { service, user } = setup({ inCrm: true, existing: savedUser });
    await expect(
      service.login({ userType: 'GREEN_SHIRT', phone, laborCardNo: 'LG1' }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    expect(user.update).not.toHaveBeenCalled();
  });

  // Workflow ข้อ 3: ฝ่ายบริการลูกค้าตรวจ CRM ก่อนจองแทน
  describe('verifyCustomer (customer service books on behalf)', () => {
    const staff = {
      id: 1,
      name: 'เจ้าหน้าที่',
      type: 'EMPLOYEE' as const,
      department: 'CUSTOMER_SERVICE' as const,
      phone: null,
      laborCardNo: null,
      employeeCode: 'CS001',
      permissions: ['BOOKING_CREATE_ON_BEHALF' as const],
    };

    it('opens an account for a CRM customer who has never signed in', async () => {
      const { service, user } = setup({ inCrm: true, existing: null });
      const customer = await service.verifyCustomer(staff, {
        userType: 'BUYER',
        phone,
      });
      expect(user.create).toHaveBeenCalledTimes(1);
      expect(customer).toEqual({
        id: savedUser.id,
        name: crmCustomer.fullName,
        phone,
        userType: 'BUYER',
      });
    });

    it('refuses a customer who is not in CRM', async () => {
      const { service, user } = setup({ inCrm: false, existing: null });
      await expect(
        service.verifyCustomer(staff, { userType: 'BUYER', phone }),
      ).rejects.toMatchObject({ code: 'REGISTER_NOT_IN_CRM' });
      expect(user.create).not.toHaveBeenCalled();
    });

    it('asks for the labor card number of a green-shirt worker', async () => {
      const { service } = setup({ inCrm: true, existing: null });
      await expect(
        service.verifyCustomer(staff, { userType: 'GREEN_SHIRT', phone }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('tells staff when the phone belongs to another customer type', async () => {
      const { service } = setup({ inCrm: true, existing: savedUser });
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
        existing: { ...savedUser, isActive: false },
      });
      await expect(
        service.verifyCustomer(staff, { userType: 'BUYER', phone }),
      ).rejects.toMatchObject({ code: 'CUSTOMER_INACTIVE' });
    });
  });
});
