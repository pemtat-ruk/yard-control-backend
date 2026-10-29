import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ApiException } from './common/api-exception.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { REQUEST_ID_HEADER } from './common/http-logger.js';
import { ResponseInterceptor } from './common/response.interceptor.js';
import { env } from './config/env.js';

export const API_PREFIX = 'api/v1';

function toValidationException(errors: ValidationError[]): ApiException {
  const details = errors.flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
  return new ApiException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_FAILED',
    'Request body is invalid',
    details,
  );
}

// ตั้งค่าที่ใช้ร่วมกันระหว่างแอปจริง (main.ts) และ e2e test
export function configureApp(app: NestExpressApplication): void {
  app.useLogger(app.get(Logger));
  app.set('trust proxy', env.trustProxyHops);
  // security header มาตรฐาน: nosniff, HSTS, CSP, กัน clickjacking ฯลฯ
  app.use(helmet());
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin: env.webOrigins,
    credentials: true,
    // Date: หน้าเว็บเทียบนาฬิกาเครื่องกับ server เพื่อนับถอยหลังให้ถูกแม้เครื่องตั้งเวลาผิด
    exposedHeaders: [REQUEST_ID_HEADER, 'Date'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // แปลง query string เป็นชนิดที่ DTO ระบุด้วย @Type()
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: toValidationException,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
}
