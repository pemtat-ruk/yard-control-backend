import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Department } from '../../auth/domain/permissions.js';

const DEPARTMENTS: Department[] = [
  'CUSTOMER_SERVICE',
  'YARD_MANAGEMENT',
  'IT',
  'OTHER',
];
const CODE_MAX = 50;
const NAME_MAX = 255;
// รหัสผ่านเริ่มต้นที่ IT ตั้งให้ (NIST SP 800-63B: อย่างน้อย 8 ตัว ไม่บังคับรูปแบบ)
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

export class CreateEmployeeDto {
  @ApiProperty({
    example: 'YD002',
    description: 'รหัสพนักงาน (ตัวอักษรอังกฤษ/ตัวเลข)',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9-]+$/)
  @MaxLength(CODE_MAX)
  employeeCode: string;

  @ApiProperty({ example: 'สมศักดิ์ ใจงาม' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX)
  fullName: string;

  @ApiProperty({ enum: DEPARTMENTS })
  @IsIn(DEPARTMENTS)
  department: Department;

  @ApiProperty({ description: 'รหัสผ่านเริ่มต้น อย่างน้อย 8 ตัว' })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(PASSWORD_MAX)
  password: string;
}

export class SetEmployeeActiveDto {
  @ApiProperty({ description: 'false = ปิดใช้งาน (เข้าสู่ระบบไม่ได้ทันที)' })
  @IsBoolean()
  isActive: boolean;
}
