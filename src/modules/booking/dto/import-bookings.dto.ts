import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// ไฟล์ CSV ไม่เกิน 200 แถว แถวละไม่ถึง 500 ตัวอักษร
const CSV_MAX_LENGTH = 100_000;

export class ImportBookingsDto {
  @ApiProperty({
    description:
      'เนื้อหาไฟล์ CSV: phone,labor_card_no,start_date,end_date,start_time,rounds,slots,skip_dates',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CSV_MAX_LENGTH)
  csv: string;
}
