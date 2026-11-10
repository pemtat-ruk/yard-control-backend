import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsInt, Min } from 'class-validator';

export class UpdateRolesDto {
  @ApiProperty({
    example: [6],
    description: 'กลุ่มสิทธิ์ (RoleID) ทั้งหมดที่พนักงานคนนี้ควรมีหลังบันทึก',
  })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  roleIds: number[];
}
