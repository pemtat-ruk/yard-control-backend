import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DATE_PATTERN } from '../../../common/service-date.js';
import type { PaymentPlan } from '../../payment/domain/schedule.js';

const PAYMENT_PLANS: PaymentPlan[] = ['FULL', 'DAILY'];
const MAX_SLOTS_PER_BOOKING = 50;
const MAX_DAYS_PER_PAYMENT = 366;
const SEARCH_MAX_LENGTH = 50;

export class CreateBookingDto {
  @ApiProperty({ example: '2026-09-01', description: 'วันบริการแรก' })
  @Matches(DATE_PATTERN)
  startDate: string;

  @ApiProperty({ example: '2026-09-30', description: 'วันบริการสุดท้าย' })
  @Matches(DATE_PATTERN)
  endDate: string;

  @ApiProperty({ example: 0, description: '0 = 07:00, 1 = 11:00, ...' })
  @IsInt()
  @Min(0)
  startRound: number;

  @ApiProperty({ example: 1, description: 'จำนวนรอบต่อวัน (รอบละ 4 ชม.)' })
  @IsInt()
  @Min(1)
  roundCount: number;

  @ApiPropertyOptional({
    type: [String],
    example: ['2026-09-02'],
    description:
      'วันในช่วงที่ไม่ต้องการจอง (อยู่ระหว่างวันแรกกับวันสุดท้ายเท่านั้น)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DAYS_PER_PAYMENT)
  @ArrayUnique()
  @Matches(DATE_PATTERN, { each: true })
  skipDates?: string[];

  @ApiProperty({ type: [Number], description: 'ช่องจอดที่จอง' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SLOTS_PER_BOOKING)
  @ArrayUnique()
  @IsInt({ each: true })
  slotIds: number[];

  @ApiProperty({ enum: PAYMENT_PLANS })
  @IsIn(PAYMENT_PLANS)
  plan: PaymentPlan;

  @ApiPropertyOptional({
    description: 'ฝ่ายบริการลูกค้าจองแทน: id ของผู้ขอใช้บริการ',
  })
  @IsOptional()
  @IsInt()
  customerId?: number;

  @ApiPropertyOptional({
    description:
      'ยอดรวมที่ผู้ใช้เห็นตอนกดยืนยัน — ราคาเปลี่ยนก่อนยืนยันจะได้ PRICE_CHANGED แทนการเก็บยอดใหม่เงียบๆ',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedTotal?: number;
}

// ข้อ 6.1: ชำระค่าบริการรายวันของการจองแบบวันต่อวัน (หลายวันในครั้งเดียวได้)
export class PayDaysDto {
  @ApiProperty({ type: [String], example: ['2026-09-02', '2026-09-03'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DAYS_PER_PAYMENT)
  @ArrayUnique()
  @Matches(DATE_PATTERN, { each: true })
  dates: string[];
}

export class SearchQueryDto {
  @ApiPropertyOptional({ description: 'คำค้น' })
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  q?: string;
}

// ALL = ทุกรายการ ทีละหน้า; PENDING = ยังต้องชำระ; ACTIVE = ยังไม่จบ (รอชำระ/ยืนยันแล้ว และยังไม่เลยวันสุดท้าย)
// PENDING / ACTIVE ส่งครบทุกรายการ ไม่ตัดหน้า — หน้ารอชำระ หน้าแรก และปฏิทินต้องไม่พลาดการจองเก่าที่ยังใช้อยู่
export const BOOKING_SCOPES = ['ALL', 'PENDING', 'ACTIVE'] as const;
export type BookingScope = (typeof BOOKING_SCOPES)[number];

export class ListBookingsQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({ enum: BOOKING_SCOPES, default: 'ALL' })
  @IsOptional()
  @IsIn(BOOKING_SCOPES)
  scope?: BookingScope;

  @ApiPropertyOptional({
    description:
      'โหลดต่อ (scope ALL): เฉพาะการจองที่ id น้อยกว่านี้ — ส่ง id ของรายการสุดท้ายที่มีอยู่',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  before?: number;
}
