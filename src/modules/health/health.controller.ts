import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/auth.decorators.js';
import {
  HealthService,
  type HealthStatus,
  type ReadyStatus,
} from './health.service.js';

// ระบบ monitor เรียกถี่จาก IP เดียว จึงไม่นับ rate limit
@ApiTags('health')
@SkipThrottle()
@Public()
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @ApiOperation({ summary: 'สถานะระบบและฐานข้อมูล (ตอบ 200 เสมอ)' })
  check(): Promise<HealthStatus> {
    return this.healthService.check();
  }

  @Get('ready')
  @ApiOperation({ summary: 'พร้อมรับ request หรือไม่ (503 เมื่อฐานข้อมูลล่ม)' })
  ready(): Promise<ReadyStatus> {
    return this.healthService.assertReady();
  }
}
