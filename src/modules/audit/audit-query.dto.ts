import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const TEXT_MAX = 100;

export class AuditQueryDto {
  @ApiPropertyOptional({ example: 'LOGIN', description: 'ประเภทการกระทำ' })
  @IsOptional()
  @IsString()
  @MaxLength(TEXT_MAX)
  action?: string;

  @ApiPropertyOptional({
    description: 'ค้นจากชื่อหรือรหัสพนักงานของผู้ทำรายการ',
  })
  @IsOptional()
  @IsString()
  @MaxLength(TEXT_MAX)
  q?: string;

  @ApiPropertyOptional({ example: '2026-11-01T00:00:00+07:00' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-02T23:59:59+07:00' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'โหลดต่อ: เฉพาะรายการที่ id น้อยกว่านี้',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  before?: number;
}
