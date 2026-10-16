import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

const NOTE_MAX_LENGTH = 300;

// ข้อ 5: ค่าปรับจอดเกินเวลา — ยอดเงินคำนวณที่ระบบจากเวลาที่เกิน (ไม่รับยอดจากผู้ตรวจสอบ)
export class FineTargetDto {
  @ApiProperty({ description: 'การจองที่จอดเกินเวลา' })
  @IsInt()
  bookingId: number;

  @ApiProperty({ description: 'ช่องที่จอดเกิน' })
  @IsInt()
  slotId: number;
}

export class CreateFineDto extends FineTargetDto {
  @ApiPropertyOptional({ description: 'หมายเหตุของผู้ตรวจสอบ (ถ้ามี)' })
  @IsOptional()
  @IsString()
  @MaxLength(NOTE_MAX_LENGTH)
  note?: string;
}
