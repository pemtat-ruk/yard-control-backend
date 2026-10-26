import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const NOTE_MAX_LENGTH = 300;
// การจองหนึ่งรายการมีช่องไม่เกินจำนวนนี้ในทางปฏิบัติ — กันรายการยาวผิดปกติ
const MAX_SLOTS = 50;

// ข้อ 5: ค่าปรับจอดเกินเวลา — ยอดเงินคำนวณที่ระบบจากเวลาที่เกิน (ไม่รับยอดจากผู้ตรวจสอบ)
// ปรับได้หลายช่องของการจองเดียวกันในใบเดียว (Screen Design หน้า 16)
export class FineTargetDto {
  @ApiProperty({ description: 'การจองที่จอดเกินเวลา' })
  @IsInt()
  bookingId: number;

  @ApiProperty({ description: 'ช่องที่จอดเกิน (ของการจองนี้)', type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SLOTS)
  @ArrayUnique()
  @IsInt({ each: true })
  slotIds: number[];
}

export class CreateFineDto extends FineTargetDto {
  @ApiPropertyOptional({ description: 'หมายเหตุของผู้ตรวจสอบ (ถ้ามี)' })
  @IsOptional()
  @IsString()
  @MaxLength(NOTE_MAX_LENGTH)
  note?: string;
}
