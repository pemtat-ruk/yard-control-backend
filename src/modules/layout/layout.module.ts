import { Global, Module } from '@nestjs/common';
import { LayoutService } from './layout.service.js';

// Global: รอบ ราคา ผัง การจอง และค่าปรับ ต้องรู้เวอร์ชันผังที่มีผลในแต่ละวัน
@Global()
@Module({ providers: [LayoutService], exports: [LayoutService] })
export class LayoutModule {}
