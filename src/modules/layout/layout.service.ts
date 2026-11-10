import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import {
  fromDbDate,
  toDbDate,
  todayInBangkok,
} from '../../common/service-date.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  DEFAULT_SCHEDULE,
  type RoundSchedule,
} from '../booking/domain/rounds.js';
import { scheduleOfRows } from './domain/round-set.js';

// ชุดรอบใน BookingRound (RoundNo เดียวกัน = ชุดเดียวกัน) มีผลตั้งแต่ EffectiveDate
export type RoundSet = {
  roundNo: string;
  effectiveFrom: string;
  schedule: RoundSchedule;
  // RoundID ตามลำดับรอบในวัน (index 0 = รอบแรก)
  roundIds: bigint[];
  createdAt: Date | null;
};

// เวอร์ชันผังของลาน: ชุดรอบ และราคา ที่มีผลตั้งแต่ EffectiveDate
export type LayoutVersion = {
  id: bigint;
  lotId: number;
  effectiveFrom: string;
  roundNo: string;
  rate: number | null;
  createdAt: Date | null;
};

type Tx = Prisma.TransactionClient;

function latestOn<T extends { effectiveFrom: string }>(
  items: T[],
  date: string,
): T | null {
  let found: T | null = null;
  for (const item of items) {
    if (item.effectiveFrom <= date) found = item;
  }
  return found;
}

// ข้อมูลเวอร์ชันทั้งหมดที่โหลดครั้งเดียวต่อคำขอ แล้วเลือกตามวันในหน่วยความจำ
export class Catalog {
  constructor(
    readonly roundSets: RoundSet[], // เรียงวันมีผลจากเก่าไปใหม่
    private readonly versionsByLot: Map<number, LayoutVersion[]>,
  ) {}

  roundSetOn(date: string): RoundSet | null {
    return latestOn(this.roundSets, date);
  }

  // ไม่มีชุดรอบ = ค่าตั้งต้น 07:01 รอบละ 4 ชม.
  scheduleFor(date: string): RoundSchedule {
    return this.roundSetOn(date)?.schedule ?? DEFAULT_SCHEDULE;
  }

  roundIdOf(date: string, roundIndex: number): bigint | null {
    return this.roundSetOn(date)?.roundIds[roundIndex] ?? null;
  }

  versionOn(lotId: number, date: string): LayoutVersion | null {
    return latestOn(this.versionsByLot.get(lotId) ?? [], date);
  }

  // [ถาม ข้อ 9] ราคาเป็นระดับทั้งระบบ: ทุกลานตั้งราคาพร้อมกัน จึงอ่านจากลานแรก; ยังไม่เคยตั้ง = ค่าจาก env
  priceFor(date: string): number {
    for (const versions of this.versionsByLot.values()) {
      const rate = latestOn(versions, date)?.rate;
      if (rate !== null && rate !== undefined) return rate;
    }
    return env.pricePerSlotRound;
  }

  // วันที่มีการเปลี่ยนราคา (ของลานแรก) พร้อมราคา — ใช้แสดงประวัติราคา
  rateChanges(): {
    versionId: bigint;
    effectiveFrom: string;
    rate: number;
    createdAt: Date | null;
  }[] {
    const [versions] = [...this.versionsByLot.values()];
    const changes: ReturnType<Catalog['rateChanges']> = [];
    for (const version of versions ?? []) {
      if (version.rate === null) continue;
      if (changes.at(-1)?.rate === version.rate) continue;
      changes.push({
        versionId: version.id,
        effectiveFrom: version.effectiveFrom,
        rate: version.rate,
        createdAt: version.createdAt,
      });
    }
    return changes;
  }
}

// ParkingLayoutVersion / ParkingRate / BookingRound ตามแบบของ SA
// การเปลี่ยนรอบหรือราคา = เวอร์ชันใหม่ของทุกลานที่มีผลตั้งแต่วันที่ (docs/sa-schema-tasks.md ข้อ 3)
@Injectable()
export class LayoutService {
  constructor(private readonly prisma: PrismaService) {}

  async catalog(client: Tx = this.prisma): Promise<Catalog> {
    const [rounds, versions] = await Promise.all([
      client.bookingRound.findMany({
        where: { isActive: true },
        orderBy: [{ effectiveDate: 'asc' }, { roundSequence: 'asc' }],
      }),
      client.parkingLayoutVersion.findMany({
        where: { isActive: true },
        include: {
          rates: {
            where: { isActive: true },
            orderBy: { parkingRateId: 'desc' },
          },
        },
        orderBy: [{ effectiveDate: 'asc' }, { parkingLayoutId: 'asc' }],
      }),
    ]);

    const sets = new Map<string, typeof rounds>();
    for (const row of rounds) {
      sets.set(row.roundNo, [...(sets.get(row.roundNo) ?? []), row]);
    }
    const roundSets: RoundSet[] = [...sets.entries()]
      .map(([roundNo, rows]) => ({
        roundNo,
        effectiveFrom: fromDbDate(rows[0].effectiveDate),
        schedule: scheduleOfRows(rows),
        roundIds: rows.map((row) => row.roundId),
        createdAt: rows[0].createDate,
      }))
      .sort(
        (a, b) =>
          a.effectiveFrom.localeCompare(b.effectiveFrom) ||
          a.roundNo.localeCompare(b.roundNo),
      );

    const versionsByLot = new Map<number, LayoutVersion[]>();
    for (const version of versions) {
      const lotId = Number(version.parkingId);
      const item: LayoutVersion = {
        id: version.parkingLayoutId,
        lotId,
        effectiveFrom: fromDbDate(version.effectiveDate),
        roundNo: version.roundNo,
        rate: version.rates[0] ? Number(version.rates[0].rateAmount) : null,
        createdAt: version.createdDate,
      };
      versionsByLot.set(lotId, [...(versionsByLot.get(lotId) ?? []), item]);
    }
    return new Catalog(roundSets, versionsByLot);
  }

  // เปลี่ยนชุดรอบหรือราคา ตั้งแต่วันที่: ทุกลานมีเวอร์ชันที่วันนั้น แล้วส่งค่าใหม่ต่อไปยังเวอร์ชันหลังจากนั้น
  // ที่ยังใช้ค่าเดิมอยู่ (เวอร์ชันหลังที่ตั้งค่าอื่นไว้เองแล้วไม่ถูกเขียนทับ)
  async applyChange(
    tx: Tx,
    change: { effectiveFrom: string; roundNo?: string; rate?: number },
    actor: string,
  ): Promise<void> {
    const lots = await tx.parking.findMany({
      where: { extra: { deletedAt: null } },
      select: { parkingId: true },
    });
    for (const { parkingId } of lots) {
      const target = await this.ensureVersionAt(
        tx,
        parkingId,
        change.effectiveFrom,
        actor,
      );
      const versions = await tx.parkingLayoutVersion.findMany({
        where: { parkingId, isActive: true },
        include: {
          rates: {
            where: { isActive: true },
            orderBy: { parkingRateId: 'desc' },
          },
        },
        orderBy: { effectiveDate: 'asc' },
      });
      const index = versions.findIndex(
        (version) => version.parkingLayoutId === target,
      );
      const before = index > 0 ? versions[index - 1] : null;
      const later = versions.slice(index);

      if (change.roundNo !== undefined) {
        const oldRoundNo = before?.roundNo ?? later[0].roundNo;
        for (const [i, version] of later.entries()) {
          if (i > 0 && version.roundNo !== oldRoundNo) break;
          await tx.parkingLayoutVersion.update({
            where: { parkingLayoutId: version.parkingLayoutId },
            data: { roundNo: change.roundNo },
          });
        }
      }
      if (change.rate !== undefined) {
        const rateOf = (version: (typeof versions)[number]) =>
          version.rates[0] ? Number(version.rates[0].rateAmount) : null;
        const oldRate = before ? rateOf(before) : rateOf(later[0]);
        for (const [i, version] of later.entries()) {
          if (i > 0 && rateOf(version) !== oldRate) break;
          await tx.parkingRate.updateMany({
            where: { parkingLayoutId: version.parkingLayoutId, isActive: true },
            data: { isActive: false },
          });
          await tx.parkingRate.create({
            data: {
              parkingLayoutId: version.parkingLayoutId,
              rateAmount: change.rate,
              createdBy: actor,
            },
          });
        }
      }
    }
  }

  // เวอร์ชันของลานที่วันนั้นพอดี — ไม่มีก็สร้างโดยใช้ชุดรอบและราคาของเวอร์ชันก่อนหน้า
  private async ensureVersionAt(
    tx: Tx,
    parkingId: bigint,
    date: string,
    actor: string,
  ): Promise<bigint> {
    const versions = await tx.parkingLayoutVersion.findMany({
      where: { parkingId, isActive: true },
      include: {
        rates: {
          where: { isActive: true },
          orderBy: { parkingRateId: 'desc' },
        },
      },
      orderBy: { effectiveDate: 'asc' },
    });
    const exact = versions.find(
      (version) => fromDbDate(version.effectiveDate) === date,
    );
    if (exact) return exact.parkingLayoutId;

    const before = [...versions]
      .reverse()
      .find((version) => fromDbDate(version.effectiveDate) < date);
    const source = before ?? versions[0];
    const catalog = await this.catalog(tx);
    const roundNo = source?.roundNo ?? catalog.roundSetOn(date)?.roundNo;
    if (!roundNo) throw new Error('No round set to attach to the version');
    const rate = source?.rates[0]
      ? Number(source.rates[0].rateAmount)
      : catalog.priceFor(date);
    return this.createVersion(tx, {
      parkingId,
      date,
      roundNo,
      rate,
      versionNo: `V${versions.length + 1}`,
      actor,
    });
  }

  private async createVersion(
    tx: Tx,
    input: {
      parkingId: bigint;
      date: string;
      roundNo: string;
      rate: number;
      versionNo: string;
      actor: string;
    },
  ): Promise<bigint> {
    const version = await tx.parkingLayoutVersion.create({
      data: {
        parkingId: input.parkingId,
        roundNo: input.roundNo,
        versionNo: input.versionNo,
        effectiveDate: toDbDate(input.date),
        createdBy: input.actor,
        rates: { create: { rateAmount: input.rate, createdBy: input.actor } },
      },
    });
    return version.parkingLayoutId;
  }

  // ลานใหม่: เวอร์ชันแรกมีผลวันนี้ ใช้ชุดรอบและราคาปัจจุบัน
  async createFirstVersion(
    tx: Tx,
    parkingId: bigint,
    actor: string,
    now: Date = new Date(),
  ): Promise<void> {
    await this.ensureVersionAt(tx, parkingId, todayInBangkok(now), actor);
  }
}
