import { Injectable } from '@nestjs/common';
import { fromDbDate, toDbDate } from '../../common/service-date.js';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { CreateRateDto } from './dto/create-rate.dto.js';

export type RateView = {
  id: number;
  pricePerSlotRound: number;
  effectiveFrom: string;
  permitRef: string;
  createdAt: string;
};

// ข้อ 2: ราคาปรับตามหนังสืออนุญาตของบริษัทเท่านั้น — เพิ่มแถวใหม่ทุกครั้ง ไม่แก้ทับของเดิม
// [ถาม ข้อ 9] ตอนนี้ราคาเป็นระดับทั้งระบบ (ทุกลาน ทุกรอบ ราคาเดียว)
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // อัตราที่มีผล ณ วันบริการ; ยังไม่เคยตั้งราคา = ใช้ค่าตั้งต้นจาก env
  async priceFor(serviceDate: string): Promise<number> {
    const rate = await this.prisma.rateConfig.findFirst({
      where: { lotId: null, effectiveFrom: { lte: toDbDate(serviceDate) } },
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
    });
    return rate ? Number(rate.pricePerSlotRound) : env.pricePerSlotRound;
  }

  async list(): Promise<RateView[]> {
    const rates = await this.prisma.rateConfig.findMany({
      where: { lotId: null },
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
    });
    return rates.map((rate) => ({
      id: rate.id,
      pricePerSlotRound: Number(rate.pricePerSlotRound),
      effectiveFrom: fromDbDate(rate.effectiveFrom),
      permitRef: rate.permitRef,
      createdAt: rate.createdAt.toISOString(),
    }));
  }

  async create(user: AuthUser, dto: CreateRateDto): Promise<RateView[]> {
    const rate = await this.prisma.rateConfig.create({
      data: {
        pricePerSlotRound: dto.pricePerSlotRound,
        effectiveFrom: toDbDate(dto.effectiveFrom),
        permitRef: dto.permitRef.trim(),
        createdById: user.id,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'RATE_CREATE',
      entity: 'rate_config',
      entityId: rate.id,
      detail: {
        pricePerSlotRound: dto.pricePerSlotRound,
        effectiveFrom: dto.effectiveFrom,
        permitRef: rate.permitRef,
      },
    });
    return this.list();
  }
}
