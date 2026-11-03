import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  CreateEmployeeDto,
  SetEmployeeActiveDto,
} from './dto/manage-employee.dto.js';
import { UpdatePermissionsDto } from './dto/update-permissions.dto.js';
import { UsersService, type EmployeeView } from './users.service.js';

// การให้สิทธิ์เป็นงานตั้งค่าระบบของฝ่าย IT
@ApiTags('users')
@RequirePermission('SETTINGS_MANAGE')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('employees')
  @ApiOperation({ summary: 'พนักงานทั้งหมดพร้อมสิทธิ์ที่มีและสิทธิ์ที่ให้ได้' })
  listEmployees(): Promise<EmployeeView[]> {
    return this.usersService.listEmployees();
  }

  @Post('employees')
  @ApiOperation({
    summary: 'เพิ่มพนักงาน (รหัสพนักงาน ชื่อ ฝ่าย รหัสผ่านเริ่มต้น)',
  })
  createEmployee(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEmployeeDto,
  ): Promise<EmployeeView> {
    return this.usersService.createEmployee(user, dto);
  }

  @Patch(':id/active')
  @ApiOperation({ summary: 'เปิด/ปิดใช้งานพนักงาน' })
  setActive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetEmployeeActiveDto,
  ): Promise<EmployeeView> {
    return this.usersService.setActive(user, id, dto);
  }

  @Put(':id/permissions')
  @ApiOperation({ summary: 'กำหนดสิทธิ์รายบุคคลของพนักงาน' })
  updatePermissions(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePermissionsDto,
  ): Promise<EmployeeView> {
    return this.usersService.updatePermissions(user, id, dto);
  }
}
