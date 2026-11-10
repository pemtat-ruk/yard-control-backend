import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const NOTE_MAX_LENGTH = 300;
const SEARCH_MAX_LENGTH = 50;

// ข้อ 5: ค่าปรับจอดเกินเวลา — ยอดเงินคำนวณที่ระบบจากเวลาที่เกิน (ไม่รับยอดจากผู้ตรวจสอบ)
// ค่าปรับ 1 ใบต่อ 1 ช่อง ตาม Data Dictionary (SA ยืนยัน 10 พ.ย. 2569)
export class FineTargetDto {
  @ApiProperty({ example: 'BK2026-11-0001', description: 'เลขที่ใบจอง' })
  @IsString()
  @MaxLength(14)
  bookingId: string;

  @ApiProperty({ description: 'ช่องที่จอดเกิน (ของการจองนี้)' })
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

// รายการค่าปรับทีละหน้า (โหลดต่อด้วย before); unpaid = เฉพาะที่ยังไม่ชำระ ครบทุกใบ ไม่ตัดหน้า (ใช้ปิดสิทธิ์จอง)
export class ListFinesQueryDto {
  @ApiPropertyOptional({
    description: 'โหลดต่อ: เฉพาะค่าปรับที่ id น้อยกว่านี้',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  before?: number;

  @ApiPropertyOptional({ description: 'true = เฉพาะที่ยังไม่ชำระ' })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  unpaid?: boolean;

  @ApiPropertyOptional({
    description: 'ค้นจากเลขที่ค่าปรับหรือเลขที่การจอง (แผงค้นหา Ctrl+K)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  q?: string;
}
