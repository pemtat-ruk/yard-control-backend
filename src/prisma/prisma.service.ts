import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

// เชื่อมต่อฐานข้อมูลเมื่อมี query แรก — แอปจึงเริ่มทำงานได้แม้ฐานข้อมูลยังไม่พร้อม
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaMssql(env.databaseUrl) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
