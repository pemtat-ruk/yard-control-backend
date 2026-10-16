import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { PaymentService } from '../payment/payment.service.js';
import type { PricingService } from '../pricing/pricing.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import type { RoundsService } from '../rounds/rounds.service.js';
import { DEFAULT_SCHEDULE } from './domain/rounds.js';
import type { AuthUser } from '../auth/auth.types.js';
import { BookingService } from './booking.service.js';

// ตารางรอบตั้งต้น 07:00 รอบละ 4 ชม.
const rounds = { resolver: () => Promise.resolve(() => DEFAULT_SCHEDULE) };

// Workflow ข้อ 3.1: มีค่าปรับค้างชำระ ไม่อนุญาตให้ใช้สิทธิ์จอด
describe('BookingService.create', () => {
  it('refuses a customer who has an unpaid fine', async () => {
    const prisma = { fine: { count: () => Promise.resolve(1) } };
    const service = new BookingService(
      prisma as unknown as PrismaService,
      {} as PricingService,
      {} as PaymentService,
      {} as AuditService,
      {} as SettingsService,
      rounds as unknown as RoundsService,
    );
    const customer: AuthUser = {
      id: 7,
      name: 'ลูกค้า',
      type: 'BUYER',
      department: null,
      phone: '0800000000',
      laborCardNo: null,
      employeeCode: null,
      permissions: ['BOOKING_CREATE_SELF'],
    };
    await expect(
      service.create(customer, {
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        startRound: 0,
        roundCount: 1,
        plan: 'FULL',
        slotIds: [1],
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_UNPAID_FINE' });
  });
});

describe('BookingService.quote', () => {
  const pricing = { priceFor: () => Promise.resolve(100) };
  const service = new BookingService(
    {} as PrismaService,
    pricing as unknown as PricingService,
    {} as PaymentService,
    {} as AuditService,
    {} as SettingsService,
    rounds as unknown as RoundsService,
  );
  // 23:00 ของวันที่ 31 ส.ค. ตามเวลาไทย — ก่อนถึงกำหนดชำระของทุกวัน
  const now = new Date('2026-08-31T16:00:00Z');
  // ตัวอย่างในเอกสาร: 1-30 ก.ย. 5 ช่อง 4 ชม. 100 บาท/ช่อง
  const request = {
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    startRound: 0,
    roundCount: 1,
    slotCount: 5,
  };

  it('quotes the full amount for the full-payment plan', async () => {
    const quote = await service.quote({ ...request, plan: 'FULL' }, now);
    expect(quote.type).toBe('LONG');
    expect(quote.totalAmount).toBe(15000);
    expect(quote.payNowAmount).toBe(15000);
  });

  it('quotes one day up front for the daily plan', async () => {
    const quote = await service.quote({ ...request, plan: 'DAILY' }, now);
    expect(quote.totalAmount).toBe(15000);
    expect(quote.payNowAmount).toBe(500);
    expect(quote.installments[1].dueAt).toBe('2026-08-31T17:00:00.000Z');
  });

  it('rejects a request that breaks booking rules, listing each rule', async () => {
    const tooFar = { ...request, startDate: '2026-09-20' };
    await expect(
      service.quote({ ...tooFar, plan: 'FULL' }, now),
    ).rejects.toMatchObject({
      code: 'BOOKING_INVALID',
      details: ['START_TOO_FAR_AHEAD'],
    });
  });

  it('rejects the daily plan for a short-term booking', async () => {
    const oneDay = { ...request, endDate: '2026-09-01' };
    await expect(
      service.quote({ ...oneDay, plan: 'DAILY' }, now),
    ).rejects.toMatchObject({ code: 'PAYMENT_PLAN_NOT_ALLOWED' });
  });
});
