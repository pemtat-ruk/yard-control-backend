import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccountAwareThrottlerGuard } from './common/throttler.guard.js';
import { LoggerModule } from 'nestjs-pino';
import { httpLoggerOptions } from './common/http-logger.js';
import { env } from './config/env.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BookingModule } from './modules/booking/booking.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { FineModule } from './modules/fine/fine.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { NotificationModule } from './modules/notification/notification.module.js';
import { PaymentModule } from './modules/payment/payment.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { ReportModule } from './modules/report/report.module.js';
import { RoundsModule } from './modules/rounds/rounds.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { YardModule } from './modules/yard/yard.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: httpLoggerOptions }),
    // จำกัดจำนวน request ต่อ IP ทุก endpoint; เกินแล้วตอบ 429 TOO_MANY_REQUESTS
    // ตัวนับอยู่ในหน่วยความจำของ process — เมื่อรันหลาย instance ต้องย้ายไป storage กลาง
    ThrottlerModule.forRoot([
      { ttl: env.rateLimitWindowMs, limit: env.rateLimitMax },
    ]),
    PrismaModule,
    AuditModule,
    SettingsModule,
    RoundsModule,
    EventsModule,
    AuthModule,
    HealthModule,
    BookingModule,
    YardModule,
    PricingModule,
    PaymentModule,
    FineModule,
    NotificationModule,
    ReportModule,
    JobsModule,
    UsersModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AccountAwareThrottlerGuard }],
})
export class AppModule {}
