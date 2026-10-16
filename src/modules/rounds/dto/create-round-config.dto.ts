import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Matches, Max, Min } from 'class-validator';
import { DATE_PATTERN } from '../../../common/service-date.js';
import { ALLOWED_ROUND_HOURS } from '../../booking/domain/rounds.js';

const LAST_HOUR = 23;

export class CreateRoundConfigDto {
  @ApiProperty({
    example: '2026-11-01',
    description: 'วันบริการแรกที่ใช้ตารางนี้',
  })
  @Matches(DATE_PATTERN)
  effectiveFrom: string;

  @ApiProperty({ example: 7, description: 'ชั่วโมงเริ่มรอบแรก 0–23' })
  @IsInt()
  @Min(0)
  @Max(LAST_HOUR)
  firstHour: number;

  @ApiProperty({ example: 4, enum: ALLOWED_ROUND_HOURS })
  @IsIn(ALLOWED_ROUND_HOURS)
  roundHours: number;
}
