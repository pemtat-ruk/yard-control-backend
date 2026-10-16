import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { DATE_PATTERN } from '../../../common/service-date.js';

export class RoundsQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'วันบริการ (ไม่ส่ง = วันนี้)',
  })
  @IsOptional()
  @Matches(DATE_PATTERN)
  date?: string;
}
