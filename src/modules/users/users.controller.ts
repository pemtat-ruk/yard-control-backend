import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { UpdateRolesDto } from './dto/update-roles.dto.js';
import {
  UsersService,
  type EmployeeView,
  type RoleView,
} from './users.service.js';

// การกำหนดกลุ่มสิทธิ์เป็นงานตั้งค่าระบบของฝ่าย IT
@ApiTags('users')
@RequirePermission('SETTINGS_MANAGE')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('roles')
  @ApiOperation({ summary: 'กลุ่มสิทธิ์ทั้งหมดพร้อมสิทธิ์ของแต่ละกลุ่ม' })
  listRoles(): Promise<RoleView[]> {
    return this.usersService.listRoles();
  }

  @Get('employees')
  @ApiQuery({ name: 'q', required: false })
  @ApiOperation({
    summary: 'พนักงานที่มีกลุ่มสิทธิ์ หรือค้นพนักงานของบริษัทด้วยชื่อ/รหัส (q)',
  })
  listEmployees(@Query('q') q?: string): Promise<EmployeeView[]> {
    return this.usersService.listEmployees(q);
  }

  @Put(':code/roles')
  @ApiOperation({ summary: 'กำหนดกลุ่มสิทธิ์ของพนักงาน' })
  updateRoles(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Body() dto: UpdateRolesDto,
  ): Promise<EmployeeView> {
    return this.usersService.updateRoles(user, code, dto);
  }
}
