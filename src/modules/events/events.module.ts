import { Global, Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

// Global: การจอง การชำระ ผังลานจอด และงานตามเวลา ส่งเหตุการณ์ได้โดยไม่ต้อง import ทีละโมดูล
@Global()
@Module({
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
