import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn } from 'class-validator';
import type { Permission } from '../../auth/domain/permissions.js';
import { PERMISSIONS } from '../domain/permission-change.js';

export class UpdatePermissionsDto {
  @ApiProperty({
    example: ['SLOT_INSPECT'],
    description: 'สิทธิ์ทั้งหมดที่พนักงานคนนี้ควรมีหลังบันทึก',
  })
  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSIONS, { each: true })
  permissions: Permission[];
}
