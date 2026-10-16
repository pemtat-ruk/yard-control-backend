import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  NotificationService,
  type NotificationList,
} from './notification.service.js';

@ApiTags('notification')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'การแจ้งเตือนล่าสุดและจำนวนที่ยังไม่อ่าน' })
  list(@CurrentUser() user: AuthUser): Promise<NotificationList> {
    return this.notificationService.list(user);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'ทำเครื่องหมายว่าอ่านแล้วทั้งหมด' })
  markAllRead(@CurrentUser() user: AuthUser): Promise<void> {
    return this.notificationService.markAllRead(user);
  }
}
