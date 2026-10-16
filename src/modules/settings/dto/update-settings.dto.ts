import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Matches, Max, Min } from 'class-validator';
import {
  NUMBER_LIMITS,
  TRANSACTION_PREFIX_PATTERN,
} from '../domain/settings.js';

export class UpdateSettingsDto {
  @ApiProperty({ example: 'YCS', description: 'ข้อ 7: รหัสนำหน้าเลขธุรกรรม' })
  @Matches(TRANSACTION_PREFIX_PATTERN)
  transactionPrefix: string;

  @ApiProperty({ example: 15, description: 'อายุ QR ชำระค่าจอง (นาที)' })
  @IsInt()
  @Min(NUMBER_LIMITS.qrTtlMinutes.min)
  @Max(NUMBER_LIMITS.qrTtlMinutes.max)
  qrTtlMinutes: number;

  @ApiProperty({ example: 7, description: 'ระยะเวลาชำระค่าปรับ (วัน)' })
  @IsInt()
  @Min(NUMBER_LIMITS.finePaymentDays.min)
  @Max(NUMBER_LIMITS.finePaymentDays.max)
  finePaymentDays: number;

  @ApiProperty({
    example: 15,
    description: 'ข้อ 4: แจ้งเตือนก่อนหมดเวลาจอด (นาที)',
  })
  @IsInt()
  @Min(NUMBER_LIMITS.notifyBeforeMinutes.min)
  @Max(NUMBER_LIMITS.notifyBeforeMinutes.max)
  notifyBeforeMinutes: number;

  @ApiProperty({ example: 2, description: 'ตัวคูณค่าปรับจอดเกินเวลา' })
  @IsInt()
  @Min(NUMBER_LIMITS.fineMultiplier.min)
  @Max(NUMBER_LIMITS.fineMultiplier.max)
  fineMultiplier: number;
}
