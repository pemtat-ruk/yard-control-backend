import { Global, Module } from '@nestjs/common';
import { RoundsController } from './rounds.controller.js';
import { RoundsService } from './rounds.service.js';

// Global: การจอง ผัง ค่าปรับ รายงาน และงานตามเวลา ต้องใช้ตารางรอบของแต่ละวัน
@Global()
@Module({
  controllers: [RoundsController],
  providers: [RoundsService],
  exports: [RoundsService],
})
export class RoundsModule {}
