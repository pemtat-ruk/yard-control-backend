import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { DATE_PATTERN } from '../../../common/service-date.js';
import type { SlotBaseStatus } from '../domain/slot-status.js';

const BASE_STATUSES: SlotBaseStatus[] = ['OPEN', 'RESERVED', 'CLOSED'];
const INSPECTION_RESULTS = ['VACATED', 'STILL_PARKED'] as const;
const CODE_MAX_LENGTH = 20;
const NAME_MAX_LENGTH = 255;
const REASON_MAX_LENGTH = 500;
// รหัสลานและช่องจอด: ตัวอักษร ตัวเลข และขีด เพื่อให้อ่านบนผังและพิมพ์บนตั๋วได้ชัด
const CODE_PATTERN = /^[A-Za-z0-9-]+$/;

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

export class CreateLotDto {
  @ApiProperty({ example: 'C' })
  @Matches(CODE_PATTERN)
  @MaxLength(CODE_MAX_LENGTH)
  code: string;

  @ApiProperty({ example: 'ลานจอด C' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  name: string;
}

export class UpdateLotDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({ description: 'ปิดทั้งลาน = ทุกช่องจองไม่ได้' })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}

export class CreateSlotDto {
  @ApiProperty()
  @IsInt()
  lotId: number;

  @ApiProperty({ example: 'C01' })
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

  @ApiProperty()
  @IsInt()
  bookingId: number;

  @ApiProperty({ example: '2026-09-01', description: 'วันบริการที่ตรวจ' })
  @Matches(DATE_PATTERN)
  serviceDate: string;

  @ApiProperty({ enum: INSPECTION_RESULTS })
  @IsIn(INSPECTION_RESULTS)
  result: (typeof INSPECTION_RESULTS)[number];
}
