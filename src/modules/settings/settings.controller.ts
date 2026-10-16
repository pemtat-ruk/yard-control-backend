import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { Settings } from './domain/settings.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { SettingsService } from './settings.service.js';

@ApiTags('settings')
@RequirePermission('SETTINGS_MANAGE')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'ค่าตั้งค่าระบบปัจจุบัน' })
  get(): Promise<Settings> {
    return this.settingsService.current();
  }

  @Put()
  @ApiOperation({ summary: 'บันทึกค่าตั้งค่าระบบ (ฝ่าย IT)' })
  update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateSettingsDto,
  ): Promise<Settings> {
    return this.settingsService.update(user, dto);
  }
}
