import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../../common/api-exception.js';
import {
  addDays,
  bangkokInstant,
  fromDbDate,
  toDbDate,
  todayInBangkok,
} from '../../common/service-date.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  scheduleOn,
  usageWindow,
  type RoundSchedule,
} from '../booking/domain/rounds.js';
import {
  checkRoundConfig,
  earliestEffectiveDate,
} from './domain/round-config.js';
import type { CreateRoundConfigDto } from './dto/create-round-config.dto.js';

export type RoundConfigView = {
  id: number;
  effectiveFrom: string;
  firstHour: number;
  roundHours: number;
  createdAt: string;
};

export type ScheduleResolver = (serviceDate: string) => RoundSchedule;

// ประวัติตาราง + วันแรกที่ตั้งตารางใหม่ได้ (พ้นช่วงจองล่วงหน้า และพ้นวันสุดท้ายที่มีการจองใช้อยู่ —
// การจองหลายวันยาวเกินช่วงจองล่วงหน้าได้ จึงต้องดูจากข้อมูลจริง)
export type RoundConfigList = { configs: RoundConfigView[]; earliest: string };

// ตารางรอบของแต่ละวันบริการ (ข้อ 3.2) — ทุกส่วนที่คำนวณรอบโหลด resolver จากที่นี่
@Injectable()
export class RoundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ตารางมีไม่กี่แถว โหลดทั้งหมดครั้งเดียวต่อการทำงาน แล้วเลือกตามวันในหน่วยความจำ
  async resolver(): Promise<ScheduleResolver> {
    const configs = (await this.list()).map((config) => ({
      effectiveFrom: config.effectiveFrom,
      firstHour: config.firstHour,
      roundHours: config.roundHours,
    }));
    return (serviceDate) => scheduleOn(configs, serviceDate);
  }

  async list(): Promise<RoundConfigView[]> {
    const rows = await this.prisma.roundConfig.findMany({
      orderBy: { effectiveFrom: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      effectiveFrom: fromDbDate(row.effectiveFrom),
      firstHour: row.firstHour,
      roundHours: row.roundHours,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listWithEarliest(now: Date = new Date()): Promise<RoundConfigList> {
    const [configs, last] = await Promise.all([
      this.list(),
      this.prisma.slotOccupancy.findFirst({
        orderBy: { serviceDate: 'desc' },
        select: { serviceDate: true },
      }),
    ]);
    const afterWindow = earliestEffectiveDate(todayInBangkok(now));
    const afterBookings = last
      ? addDays(fromDbDate(last.serviceDate), 1)
      : afterWindow;
    return {
      configs,
      earliest: afterBookings > afterWindow ? afterBookings : afterWindow,
    };
  }

  async create(
    user: AuthUser,
    dto: CreateRoundConfigDto,
    now: Date = new Date(),
  ): Promise<RoundConfigList> {
    const error = checkRoundConfig(dto, todayInBangkok(now));
    if (error) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        error,
        'Round schedule is not allowed',
      );
    }
    await this.assertNoBookingAffected(dto, now);
    const created = await this.prisma.roundConfig.upsert({
      where: { effectiveFrom: toDbDate(dto.effectiveFrom) },
      create: {
        effectiveFrom: toDbDate(dto.effectiveFrom),
        firstHour: dto.firstHour,
        roundHours: dto.roundHours,
        createdById: user.id,
      },
      update: {
        firstHour: dto.firstHour,
        roundHours: dto.roundHours,
        createdById: user.id,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'ROUND_CONFIG_SET',
      entity: 'round_config',
      entityId: created.id,
      detail: {
        effectiveFrom: dto.effectiveFrom,
        firstHour: dto.firstHour,
        roundHours: dto.roundHours,
      },
    });
    return this.listWithEarliest(now);
  }

  // ยกเลิกตารางที่ยังไม่ถึงช่วงจองได้ (ยังไม่มีใครจองตามตารางนั้น)
  async remove(
    user: AuthUser,
    id: number,
    now: Date = new Date(),
  ): Promise<RoundConfigList> {
    const config = await this.prisma.roundConfig.findUnique({ where: { id } });
    if (!config) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'RECORD_NOT_FOUND',
        'Round schedule not found',
      );
    }
    if (
      fromDbDate(config.effectiveFrom) <
      earliestEffectiveDate(todayInBangkok(now))
    ) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'ROUND_EFFECTIVE_TOO_SOON',
        'This schedule is already open for booking',
      );
    }
    await this.prisma.roundConfig.delete({ where: { id } });
    await this.audit.record({
      userId: user.id,
      action: 'ROUND_CONFIG_DELETE',
      entity: 'round_config',
      entityId: id,
    });
    return this.listWithEarliest(now);
  }

  // กันเหนียว: มีการจองที่ใช้วันมีผลแล้ว (เช่น รอบล้นข้ามเที่ยงคืนจากวันก่อน) หรือช่วงใช้งานของวันก่อนหน้า
  // ทับเวลาเริ่มของตารางใหม่ — เปลี่ยนแล้วการจองนั้นจะผิด จึงไม่ยอม
  private async assertNoBookingAffected(
    dto: CreateRoundConfigDto,
    now: Date,
  ): Promise<void> {
    const { earliest } = await this.listWithEarliest(now);
    const resolve = await this.resolver();
    const dayBefore = addDays(dto.effectiveFrom, -1);
    const [spilled, before] = await Promise.all([
      this.prisma.slotOccupancy.count({
        where: { serviceDate: { gte: toDbDate(dto.effectiveFrom) } },
      }),
      this.prisma.bookingDay.findMany({
        where: {
          serviceDate: toDbDate(dayBefore),
          booking: { status: { not: 'CANCELLED' } },
        },
        select: {
          booking: {
            select: { startRound: true, roundCount: true, startDate: true },
          },
        },
      }),
    ]);
    const newStart = bangkokInstant(dto.effectiveFrom, dto.firstHour).getTime();
    const overlaps = before.some(({ booking }) => {
      const schedule = resolve(fromDbDate(booking.startDate));
      const { endsAt } = usageWindow(
        dayBefore,
        booking.startRound,
        booking.roundCount,
        schedule,
      );
      return endsAt.getTime() > newStart;
    });
    if (spilled > 0 || overlaps) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'ROUND_CONFIG_HAS_BOOKINGS',
        'Bookings already use this date; choose a later date',
        [earliest],
      );
    }
  }
}
