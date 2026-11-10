import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DATE_PATTERN } from '../../../common/service-date.js';
import type { SlotBaseStatus } from '../domain/slot-status.js';

const BASE_STATUSES: SlotBaseStatus[] = ['OPEN', 'RESERVED', 'CLOSED'];
const INSPECTION_RESULTS = ['VACATED', 'STILL_PARKED'] as const;
const CODE_MAX_LENGTH = 20;
// ช่องใหม่ต่อการบันทึกผังหนึ่งครั้ง (ลานจริงใหญ่สุด 112 ช่อง)
const NEW_SLOTS_MAX = 200;
const NAME_MAX_LENGTH = 255;
const REASON_MAX_LENGTH = 500;
const BOOKING_NO_MAX_LENGTH = 14;
// รหัสช่องจอด: ตัวอักษร ตัวเลข ขีด และ / (ลานจริงใช้แบบ "14/7" = บล็อก 14 ช่อง 7)
const CODE_PATTERN = /^[A-Za-z0-9/-]+$/;
// รหัสลานไม่มีขีด เพราะขีดเป็นตัวคั่นลานกับช่องในรหัสเต็ม ("P5-12" — ดู slot-label.ts)
const LOT_CODE_PATTERN = /^[A-Za-z0-9/]+$/;

// ตารางช่อง × รอบของวันเดียว
export class DayBoardQueryDto {
  @ApiProperty({ example: '2026-11-03' })
  @Matches(DATE_PATTERN)
  date: string;
}

// ช่วงเวลาที่ต้องการดูว่าช่องไหนว่าง (query string จึงต้องแปลงเป็นตัวเลข)
export class AvailabilityQueryDto {
  @ApiProperty({ example: '2026-09-01' })
  @Matches(DATE_PATTERN)
  startDate: string;

  @ApiProperty({ example: '2026-09-01' })
  @Matches(DATE_PATTERN)
  endDate: string;

  @ApiProperty({ example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  startRound: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roundCount: number;

  // query string ส่งเป็นวันที่คั่นด้วยจุลภาค: skipDates=2026-09-02,2026-09-03
  @ApiPropertyOptional({
    example: '2026-09-02,2026-09-03',
    description: 'วันในช่วงที่ไม่ต้องการจอง',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @Matches(DATE_PATTERN, { each: true })
  skipDates?: string[];
}

// ชื่อที่มีแต่ช่องว่างถือเป็นชื่อว่าง (ตัดช่องว่างหัวท้ายก่อนตรวจ)
const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateLotDto {
  @ApiProperty({ example: 'P6' })
  @Matches(LOT_CODE_PATTERN)
  @MaxLength(CODE_MAX_LENGTH)
  code: string;

  @ApiProperty({ example: 'ลานจอด C' })
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  name: string;
}

export class UpdateLotDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({ description: 'ปิดทั้งลาน = ทุกช่องจองไม่ได้' })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}

// ผังของลาน: { rows: [...] } ตาม LotLayout — ตรวจรายละเอียดใน domain/layout-input.ts; null = ใช้ผังตั้งต้น
export class UpdateLotLayoutDto {
  @ApiProperty({
    nullable: true,
    example: {
      rows: [
        { kind: 'slots', facing: 'UP', cells: [{ slot: '1' }] },
        { kind: 'aisle', label: 'ทางรถ' },
      ],
    },
  })
  @ValidateIf((_, value) => value !== null)
  @IsObject()
  layout: Record<string, unknown> | null;

  @ApiPropertyOptional({
    example: ['69', '70'],
    description: 'ช่องใหม่ที่สร้างพร้อมบันทึกผัง',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(NEW_SLOTS_MAX)
  @Matches(CODE_PATTERN, { each: true })
  @MaxLength(CODE_MAX_LENGTH, { each: true })
  newSlots?: string[];

  @ApiPropertyOptional({
    example: ['12'],
    description:
      'ช่องที่ลบพร้อมบันทึกผัง — ช่องที่มีการจองค้างอยู่ลบไม่ได้ (SLOT_HAS_BOOKINGS, details = เลขช่อง)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(NEW_SLOTS_MAX)
  @Matches(CODE_PATTERN, { each: true })
  @MaxLength(CODE_MAX_LENGTH, { each: true })
  deletedSlots?: string[];
}

export class CreateSlotDto {
  @ApiProperty()
  @IsInt()
  lotId: number;

  @ApiProperty({ example: '14/7' })
  @Matches(CODE_PATTERN)
  @MaxLength(CODE_MAX_LENGTH)
  code: string;
}

export class UpdateSlotStatusDto {
  @ApiProperty({ enum: BASE_STATUSES })
  @IsIn(BASE_STATUSES)
  baseStatus: SlotBaseStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(REASON_MAX_LENGTH)
  reason?: string;
}

export class RecordInspectionDto {
  @ApiProperty()
  @IsInt()
  slotId: number;

  @ApiProperty({ example: 'BK2026-11-0001', description: 'เลขที่ใบจอง' })
  @IsString()
  @MaxLength(BOOKING_NO_MAX_LENGTH)
  bookingId: string;

  @ApiProperty({ example: '2026-09-01', description: 'วันบริการที่ตรวจ' })
  @Matches(DATE_PATTERN)
  serviceDate: string;

  @ApiProperty({ enum: INSPECTION_RESULTS })
  @IsIn(INSPECTION_RESULTS)
  result: (typeof INSPECTION_RESULTS)[number];
}
