import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

// ข้อ 8: กรองตามช่วงวันและเวลาที่ชำระเงิน
export class PaymentReportQueryDto {
  @ApiProperty({ example: '2026-10-01T00:00:00+07:00' })
  @IsISO8601({ strict: true })
  from: string;

  @ApiProperty({ example: '2026-10-09T23:59:59+07:00' })
  @IsISO8601({ strict: true })
  to: string;
}
