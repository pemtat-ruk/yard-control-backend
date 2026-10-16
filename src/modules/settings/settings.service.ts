import { Injectable } from '@nestjs/common';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  mergeSettings,
  SETTING_KEYS,
  type Settings,
} from './domain/settings.js';
import type { UpdateSettingsDto } from './dto/update-settings.dto.js';

// [ถาม ข้อ 6] ตัวคูณค่าปรับสมมุติ จนกว่าเจ้าของงานกำหนดอัตราจริง
const DEFAULT_FINE_MULTIPLIER = 2;

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

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // อ่านจากฐานข้อมูลทุกครั้ง (ไม่กี่แถว) เพื่อให้ค่าที่เปลี่ยนมีผลทันทีทุก instance
  async current(): Promise<Settings> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: SETTING_KEYS } },
    });
    return mergeSettings(defaults(), rows);
  }

  async update(user: AuthUser, dto: UpdateSettingsDto): Promise<Settings> {
    const before = await this.current();
    const changed = SETTING_KEYS.filter((key) => before[key] !== dto[key]);
    await this.prisma.$transaction(
      changed.map((key) =>
        this.prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: String(dto[key]), updatedById: user.id },
          update: { value: String(dto[key]), updatedById: user.id },
        }),
      ),
    );
    if (changed.length > 0) {
      await this.audit.record({
        userId: user.id,
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
