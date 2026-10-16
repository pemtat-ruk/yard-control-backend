import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { env } from './config/env.js';

const DOCS_PATH = 'api/docs';

async function bootstrap() {
  // bufferLogs: เก็บ log ช่วงเริ่มแอปไว้จนกว่า logger กลางจะพร้อม
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  configureApp(app);
  // รับ SIGTERM / SIGINT: หยุดรับ request ใหม่ รอของเดิมจบ แล้วปิดการเชื่อมต่อฐานข้อมูล
  app.enableShutdownHooks();

  const docs = new DocumentBuilder()
    .setTitle('Yard Control System API')
    .setDescription('ระบบลานจอดรถจัดเรียงสินค้า')
    .setVersion('1')
    .build();
  SwaggerModule.setup(DOCS_PATH, app, SwaggerModule.createDocument(app, docs));

  await app.listen(env.port);
}
await bootstrap();
