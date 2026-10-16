import { Global, Module } from '@nestjs/common';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

// Global: การจอง การชำระ ค่าปรับ และงานตามเวลา อ่านค่าตั้งค่าได้โดยไม่ต้อง import ทีละโมดูล
@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
