import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const BOOKING_TYPES = ['SHORT', 'LONG'] as const;
const PAYMENT_PLANS = ['FULL', 'DAILY'] as const;
const SOURCES = ['SELF', 'CUSTOMER_SERVICE', 'IMPORT'] as const;
const STATES = ['PAID', 'PENDING', 'CANCELLED'] as const;
const KEYWORD_MAX_LENGTH = 100;
const CUSTOMER_TYPES = ['BUYER', 'GREEN_SHIRT', 'EMPLOYEE'] as const;
const LOT_CODE_MAX_LENGTH = 20;

// Screen Design ข้อ 8.1: รายการจองในช่วงวันเวลาที่ทำรายการ กรองตามรูปแบบการจอง การชำระ ช่องทาง และสถานะ
export class BookingReportQueryDto {
  @ApiProperty({ example: '2026-10-01T00:00:00+07:00' })
  @IsISO8601({ strict: true })
  from: string;

  @ApiProperty({ example: '2026-10-09T23:59:59+07:00' })
  @IsISO8601({ strict: true })
  to: string;

  @ApiPropertyOptional({ enum: BOOKING_TYPES })
  @IsOptional()
  @IsIn(BOOKING_TYPES)
  type?: (typeof BOOKING_TYPES)[number];

  @ApiPropertyOptional({ enum: PAYMENT_PLANS })
  @IsOptional()
  @IsIn(PAYMENT_PLANS)
  plan?: (typeof PAYMENT_PLANS)[number];

  @ApiPropertyOptional({ enum: SOURCES })
  @IsOptional()
  @IsIn(SOURCES)
  source?: (typeof SOURCES)[number];

  @ApiPropertyOptional({ enum: STATES })
  @IsOptional()
  @IsIn(STATES)
  state?: (typeof STATES)[number];

  @ApiPropertyOptional({ description: 'เลขที่การจอง ชื่อ หรือเบอร์โทร' })
  @IsOptional()
  @IsString()
  @MaxLength(KEYWORD_MAX_LENGTH)
  q?: string;

  // Screen Design แดชบอร์ด: กรองตามลานจอดและประเภทผู้ใช้
  @ApiPropertyOptional({ description: 'รหัสลานจอด เช่น A' })
  @IsOptional()
  @IsString()
  @MaxLength(LOT_CODE_MAX_LENGTH)
  lot?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_TYPES })
  @IsOptional()
  @IsIn(CUSTOMER_TYPES)
  customerType?: (typeof CUSTOMER_TYPES)[number];
}
