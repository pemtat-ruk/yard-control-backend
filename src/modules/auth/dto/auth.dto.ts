import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { UserType } from '../domain/permissions.js';

const USER_TYPES: UserType[] = ['EMPLOYEE', 'GREEN_SHIRT', 'BUYER'];
const CUSTOMER_TYPES: UserType[] = ['GREEN_SHIRT', 'BUYER'];
export const PHONE_PATTERN = /^0\d{9}$/;
const CODE_MAX_LENGTH = 50;
const PASSWORD_MAX_LENGTH = 128;

// ข้อ 1: พนักงานใช้รหัสพนักงาน + รหัสผ่าน, ผู้ซื้อใช้เบอร์โทร, แรงงานเสื้อเขียวใช้บัตรแรงงาน + เบอร์โทร
export class LoginDto {
  @ApiProperty({ enum: USER_TYPES })
  @IsIn(USER_TYPES)
  userType: UserType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(CODE_MAX_LENGTH)
  employeeCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password?: string;

  @ApiPropertyOptional({ example: '0800000000' })
  @IsOptional()
  @Matches(PHONE_PATTERN)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(CODE_MAX_LENGTH)
  laborCardNo?: string;
}

// ข้อมูลระบุตัวผู้ขอใช้บริการ: ใช้ทั้งลงทะเบียนเอง และฝ่ายบริการลูกค้าตรวจ CRM ก่อนจองแทน (Workflow ข้อ 3)
export class RegisterDto {
  @ApiProperty({ enum: CUSTOMER_TYPES })
  @IsIn(CUSTOMER_TYPES)
  userType: UserType;

  @ApiProperty({ example: '0800000000' })
  @Matches(PHONE_PATTERN)
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(CODE_MAX_LENGTH)
  laborCardNo?: string;
}

export class VerifyCustomerDto extends RegisterDto {}
