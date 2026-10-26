import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// ไฟล์ CSV ไม่เกิน 200 แถว แถวละไม่ถึง 500 ตัวอักษร
const CSV_MAX_LENGTH = 100_000;
const FILE_NAME_MAX_LENGTH = 200;

export class ImportBookingsDto {
  @ApiProperty({
    description:
      'เนื้อหาไฟล์ CSV: phone,labor_card_no,start_date,end_date,start_time,rounds,slots,skip_dates',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CSV_MAX_LENGTH)
  csv: string;

  // ชื่อไฟล์ที่ผู้ใช้เลือก ใช้แสดงในรายการที่นำเข้า (Screen Design "รายการที่นำเข้า")
  @ApiPropertyOptional({ example: 'regular-customers-nov.csv' })
  @IsOptional()
  @IsString()
  @MaxLength(FILE_NAME_MAX_LENGTH)
  fileName?: string;
}
