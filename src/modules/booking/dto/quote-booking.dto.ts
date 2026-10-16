import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Min,
} from 'class-validator';
import { DATE_PATTERN } from '../../../common/service-date.js';
import type { PaymentPlan } from '../../payment/domain/schedule.js';

const PAYMENT_PLANS: PaymentPlan[] = ['FULL', 'DAILY'];
const MAX_SKIP_DATES = 366;

export class QuoteBookingDto {
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
  @ArrayMaxSize(MAX_SKIP_DATES)
  @ArrayUnique()
  @Matches(DATE_PATTERN, { each: true })
  skipDates?: string[];

  @ApiProperty({ example: 5, description: 'จำนวนช่องจอด' })
  @IsInt()
  @Min(1)
  slotCount: number;

  @ApiProperty({ enum: PAYMENT_PLANS })
  @IsIn(PAYMENT_PLANS)
  plan: PaymentPlan;
}
