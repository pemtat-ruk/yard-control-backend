import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../../common/api-exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const SERVICE_NAME = 'yard-control-backend';

export type HealthStatus = {
  status: 'ok';
  service: string;
  database: 'up' | 'down';
};

export type ReadyStatus = { status: 'ready' };

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  // บอกว่า process ยังทำงาน — ตอบ 200 เสมอแม้ฐานข้อมูลล่ม
  async check(): Promise<HealthStatus> {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      database: (await this.isDatabaseUp()) ? 'up' : 'down',
    };
  }

  // บอกว่าพร้อมรับ request จริง — ให้ load balancer / container ใช้ตัดสินใจส่ง traffic
  async assertReady(): Promise<ReadyStatus> {
    if (!(await this.isDatabaseUp())) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'NOT_READY',
        'Database is not reachable',
      );
    }
    return { status: 'ready' };
  }

  private async isDatabaseUp(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
