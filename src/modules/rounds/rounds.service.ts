import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../../common/api-exception.js';
import { nextDocumentNo } from '../../common/document-no.js';
import {
  addDays,
  fromDbDate,
  toDbDate,
  todayInBangkok,
} from '../../common/service-date.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { roundInstant, type RoundSchedule } from '../booking/domain/rounds.js';
import { roundRows } from '../layout/domain/round-set.js';
import { LayoutService } from '../layout/layout.service.js';
import {
  checkRoundConfig,
  earliestEffectiveDate,
} from './domain/round-config.js';
import type { CreateRoundConfigDto } from './dto/create-round-config.dto.js';

export type RoundConfigView = {
  id: number; // RoundID ของรอบแรกในชุด
  effectiveFrom: string;
  firstHour: number;
  roundHours: number;
  createdAt: string;
};

export type ScheduleResolver = (serviceDate: string) => RoundSchedule;

// ประวัติตาราง + วันแรกที่ตั้งตารางใหม่ได้ (พ้นช่วงจองล่วงหน้า และพ้นวันสุดท้ายที่มีการจองใช้อยู่ —
// การจองหลายวันยาวเกินช่วงจองล่วงหน้าได้ จึงต้องดูจากข้อมูลจริง)
export type RoundConfigList = { configs: RoundConfigView[]; earliest: string };

const HOLDING = { bookingStatus: 'A' };

// ตารางรอบของแต่ละวันบริการ (ข้อ 3.2) — เก็บใน BookingRound เป็นชุดตาม RoundNo
@Injectable()
export class RoundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly layout: LayoutService,
  ) {}

  async resolver(): Promise<ScheduleResolver> {
    const catalog = await this.layout.catalog();
    return (serviceDate) => catalog.scheduleFor(serviceDate);
  }

  async list(): Promise<RoundConfigView[]> {
    const catalog = await this.layout.catalog();
    return [...catalog.roundSets].reverse().map((set) => ({
      id: Number(set.roundIds[0]),
      effectiveFrom: set.effectiveFrom,
      firstHour: set.schedule.firstHour,
      roundHours: set.schedule.roundHours,
      createdAt: (set.createdAt ?? new Date(0)).toISOString(),
    }));
  }

  async listWithEarliest(now: Date = new Date()): Promise<RoundConfigList> {
    const [configs, last] = await Promise.all([
      this.list(),
      this.prisma.bookingDetail.findFirst({
        where: { booking: HOLDING },
        orderBy: { usageDate: 'desc' },
        select: { usageDate: true },
      }),
    ]);
    const afterWindow = earliestEffectiveDate(todayInBangkok(now));
    const afterBookings = last
      ? addDays(fromDbDate(last.usageDate), 1)
      : afterWindow;
    return {
      configs,
      earliest: afterBookings > afterWindow ? afterBookings : afterWindow,
    };
  }

  // ชุดรอบใหม่ (RoundNo ใหม่) มีผลตั้งแต่วันที่ — ชุดที่ตั้งไว้วันเดียวกันก่อนหน้าถูกปิดใช้งาน
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
    const effectiveDate = toDbDate(dto.effectiveFrom);
    const roundNo = await this.prisma.$transaction(async (tx) => {
      await tx.bookingRound.updateMany({
        where: { effectiveDate, isActive: true },
        data: { isActive: false },
      });
      const roundNo = await nextDocumentNo(tx, 'R', user.id, now);
      await tx.bookingRound.createMany({
        data: roundRows(dto).map((row) => ({
          ...row,
          roundNo,
          effectiveDate,
          createBy: user.id,
        })),
      });
      await this.layout.applyChange(
        tx,
        { effectiveFrom: dto.effectiveFrom, roundNo },
        user.id,
      );
      return roundNo;
    });
    await this.audit.record({
      actor: user.id,
      action: 'ROUND_CONFIG_SET',
      entity: 'booking_round',
      entityId: roundNo,
      detail: {
        effectiveFrom: dto.effectiveFrom,
        firstHour: dto.firstHour,
        roundHours: dto.roundHours,
      },
    });
    return this.listWithEarliest(now);
  }

  // ยกเลิกชุดรอบที่ยังไม่ถึงช่วงจองได้ (ยังไม่มีใครจองตามชุดนั้น) — เวอร์ชันผังกลับไปใช้ชุดก่อนหน้า
  async remove(
    user: AuthUser,
    id: number,
    now: Date = new Date(),
  ): Promise<RoundConfigList> {
    const first = await this.prisma.bookingRound.findUnique({
      where: { roundId: BigInt(id) },
    });
    if (!first || !first.isActive) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'RECORD_NOT_FOUND',
        'Round schedule not found',
      );
    }
    const effectiveFrom = fromDbDate(first.effectiveDate);
    if (effectiveFrom < earliestEffectiveDate(todayInBangkok(now))) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'ROUND_EFFECTIVE_TOO_SOON',
        'This schedule is already open for booking',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.bookingRound.updateMany({
        where: { roundNo: first.roundNo },
        data: { isActive: false },
      });
      const catalog = await this.layout.catalog(tx);
      const previous = catalog.roundSetOn(addDays(effectiveFrom, -1));
      if (previous) {
        await tx.parkingLayoutVersion.updateMany({
          where: { roundNo: first.roundNo },
          data: { roundNo: previous.roundNo },
        });
      }
    });
    await this.audit.record({
      actor: user.id,
      action: 'ROUND_CONFIG_DELETE',
      entity: 'booking_round',
      entityId: first.roundNo,
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
      this.prisma.bookingDetail.count({
        where: {
          usageDate: { gte: toDbDate(dto.effectiveFrom) },
          booking: HOLDING,
        },
      }),
      this.prisma.bookingDetail.findMany({
        where: { usageDate: toDbDate(dayBefore), booking: HOLDING },
        select: { round: { select: { roundSequence: true } } },
      }),
    ]);
    const schedule = resolve(dayBefore);
    const newStart = roundInstant(dto.effectiveFrom, dto.firstHour).getTime();
    const overlaps = before.some(({ round }) => {
      const endHour =
        schedule.firstHour + round.roundSequence * schedule.roundHours;
      return roundInstant(dayBefore, endHour).getTime() > newStart;
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
