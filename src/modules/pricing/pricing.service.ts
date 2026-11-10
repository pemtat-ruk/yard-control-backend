import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { LayoutService } from '../layout/layout.service.js';
import type { CreateRateDto } from './dto/create-rate.dto.js';

export type RateView = {
  id: number;
  pricePerSlotRound: number;
  effectiveFrom: string;
  permitRef: string;
  createdAt: string;
};

// ข้อ 2: ราคาปรับตามหนังสืออนุญาตของบริษัทเท่านั้น — ราคาใหม่ = ParkingRate ของเวอร์ชันผังที่มีผลตั้งแต่วันที่
// เลขหนังสืออนุญาตไม่มีคอลัมน์ในแบบของ SA จึงเก็บใน AuditLog (RATE_CREATE)
// [ถาม ข้อ 9] ตอนนี้ราคาเป็นระดับทั้งระบบ (ทุกลาน ทุกรอบ ราคาเดียว)
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly layout: LayoutService,
  ) {}

  async priceFor(serviceDate: string): Promise<number> {
    return (await this.layout.catalog()).priceFor(serviceDate);
  }

  async list(): Promise<RateView[]> {
    const [catalog, logs] = await Promise.all([
      this.layout.catalog(),
      this.prisma.auditLog.findMany({
        where: { action: 'RATE_CREATE' },
        orderBy: { id: 'desc' },
      }),
    ]);
    const permitOf = (effectiveFrom: string) => {
      const log = logs.find((item) => {
        const detail = JSON.parse(item.detail ?? '{}') as {
          effectiveFrom?: string;
        };
        return detail.effectiveFrom === effectiveFrom;
      });
      if (!log) return { permitRef: '', createdAt: null };
      const detail = JSON.parse(log.detail ?? '{}') as { permitRef?: string };
      return { permitRef: detail.permitRef ?? '', createdAt: log.createdDate };
    };
    return catalog
      .rateChanges()
      .reverse()
      .map((change) => {
        const permit = permitOf(change.effectiveFrom);
        return {
          id: Number(change.versionId),
          pricePerSlotRound: change.rate,
          effectiveFrom: change.effectiveFrom,
          permitRef: permit.permitRef,
          createdAt: (
            permit.createdAt ??
            change.createdAt ??
            new Date(0)
          ).toISOString(),
        };
      });
  }

  async create(user: AuthUser, dto: CreateRateDto): Promise<RateView[]> {
    const permitRef = dto.permitRef.trim();
    await this.prisma.$transaction((tx) =>
      this.layout.applyChange(
        tx,
        { effectiveFrom: dto.effectiveFrom, rate: dto.pricePerSlotRound },
        user.id,
      ),
    );
    await this.audit.record({
      actor: user.id,
      action: 'RATE_CREATE',
      entity: 'parking_rate',
      entityId: dto.effectiveFrom,
      detail: {
        pricePerSlotRound: dto.pricePerSlotRound,
        effectiveFrom: dto.effectiveFrom,
        permitRef,
      },
    });
    return this.list();
  }
}
