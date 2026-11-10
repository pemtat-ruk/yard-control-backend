import { Injectable } from '@nestjs/common';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  mergeSettings,
  SETTING_KEYS,
  type SettingKey,
  type Settings,
} from './domain/settings.js';
import type { UpdateSettingsDto } from './dto/update-settings.dto.js';

// [ถาม ข้อ 6] ตัวคูณค่าปรับสมมุติ จนกว่าจะได้อัตราจริง
const DEFAULT_FINE_MULTIPLIER = 2;

// ค่าตัวเลขเก็บใน BookingPolicy (PolicyCode / PolicyValue / Unit) ตามแบบของ SA
export const POLICY_OF: Record<
  Exclude<SettingKey, 'transactionPrefix' | 'notifyBeforeMinutes'>,
  { code: string; unit: string }
> = {
  qrTtlMinutes: { code: 'QR_TTL_MINUTE', unit: 'minute' },
  finePaymentDays: { code: 'FINE_PAYMENT_DAY', unit: 'day' },
  fineMultiplier: { code: 'FINE_MULTIPLIER', unit: 'times' },
};
// เวลาแจ้งเตือนลูกค้าก่อนหมดเวลาจอด = NotificationSetting (PARKING_END_CUSTOMER).NotiBeforeMinute
export const PARKING_END_CUSTOMER = 'PARKING_END_CUSTOMER';
// [เรา] รหัสนำหน้าธุรกรรมเป็นข้อความ เก็บใน BookingPolicy ไม่ได้ จึงอยู่ใน SystemSetting
const TRANSACTION_PREFIX = 'transactionPrefix';

// ค่าตั้งต้นเมื่อยังไม่เคยบันทึก มาจาก env (ค่าเดิมก่อนมีหน้าตั้งค่า)
function defaults(): Settings {
  return {
    transactionPrefix: env.transactionPrefix,
    qrTtlMinutes: env.qrTtlMinutes,
    finePaymentDays: env.finePaymentDays,
    notifyBeforeMinutes: env.notifyBeforeMinutes,
    fineMultiplier: DEFAULT_FINE_MULTIPLIER,
  };
}

const POLICY_KEYS = Object.keys(POLICY_OF) as (keyof typeof POLICY_OF)[];

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // อ่านจากฐานข้อมูลทุกครั้ง (ไม่กี่แถว) เพื่อให้ค่าที่เปลี่ยนมีผลทันทีทุก instance
  async current(): Promise<Settings> {
    const [policies, notification, prefix] = await Promise.all([
      this.prisma.bookingPolicy.findMany({
        where: {
          isActive: true,
          policyCode: { in: POLICY_KEYS.map((key) => POLICY_OF[key].code) },
        },
      }),
      this.prisma.notificationSetting.findFirst({
        where: {
          notiType: PARKING_END_CUSTOMER,
          isActive: true,
          OR: [{ effectiveDate: null }, { effectiveDate: { lte: new Date() } }],
        },
        orderBy: [{ effectiveDate: 'desc' }, { notiId: 'desc' }],
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: TRANSACTION_PREFIX },
      }),
    ]);
    const rows = [
      ...POLICY_KEYS.flatMap((key) => {
        const policy = policies.find(
          (item) => item.policyCode === POLICY_OF[key].code,
        );
        return policy ? [{ key, value: String(policy.policyValue) }] : [];
      }),
      ...(notification?.notiBeforeMinute != null
        ? [
            {
              key: 'notifyBeforeMinutes',
              value: String(notification.notiBeforeMinute),
            },
          ]
        : []),
      ...(prefix ? [{ key: TRANSACTION_PREFIX, value: prefix.value }] : []),
    ];
    return mergeSettings(defaults(), rows);
  }

  async update(user: AuthUser, dto: UpdateSettingsDto): Promise<Settings> {
    const before = await this.current();
    const changed = SETTING_KEYS.filter((key) => before[key] !== dto[key]);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const key of changed) {
        if (key === 'transactionPrefix') {
          await tx.systemSetting.upsert({
            where: { key },
            create: { key, value: dto.transactionPrefix, updatedBy: user.id },
            update: { value: dto.transactionPrefix, updatedBy: user.id },
          });
        } else if (key === 'notifyBeforeMinutes') {
          // ตั้งค่าใหม่ = แถวใหม่ที่มีผลตั้งแต่ตอนนี้ (เก็บประวัติแถวเดิมไว้)
          const current = await tx.notificationSetting.findFirst({
            where: { notiType: PARKING_END_CUSTOMER, isActive: true },
            orderBy: [{ effectiveDate: 'desc' }, { notiId: 'desc' }],
          });
          await tx.notificationSetting.create({
            data: {
              notiType: PARKING_END_CUSTOMER,
              notiNameTh:
                current?.notiNameTh ??
                'แจ้งเตือนลูกค้าก่อนหมดเวลาใช้งานช่องจอด',
              recipientType: current?.recipientType ?? 'CUSTOMER',
              notiBeforeMinute: dto.notifyBeforeMinutes,
              effectiveDate: now,
              createBy: user.id,
            },
          });
        } else {
          const { code, unit } = POLICY_OF[key];
          await tx.bookingPolicy.upsert({
            where: { policyCode: code },
            create: {
              policyCode: code,
              policyValue: dto[key],
              unit,
              createBy: user.id,
            },
            update: { policyValue: dto[key], isActive: true },
          });
        }
      }
    });
    if (changed.length > 0) {
      await this.audit.record({
        actor: user.id,
        action: 'SETTINGS_UPDATE',
        entity: 'system_setting',
        detail: Object.fromEntries(
          changed.map((key) => [key, { from: before[key], to: dto[key] }]),
        ),
      });
    }
    return this.current();
  }
}
