import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
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
