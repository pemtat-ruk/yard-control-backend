import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { ApiException } from './api-exception.js';

type ErrorDetail = { code: string; message: string; details?: string[] };
type ErrorBody = { error: ErrorDetail & { requestId?: string } };

// error จากฐานข้อมูลที่เป็นความผิดของ request ไม่ใช่ของระบบ
// service ที่ต้องการ code เฉพาะ (เช่น ช่องถูกจองตัดหน้า) ให้ดักแล้วโยน ApiException เอง
const PRISMA_ERRORS: Record<string, { status: number; error: ErrorDetail }> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    error: { code: 'DUPLICATE_ENTRY', message: 'Record already exists' },
  },
  P2003: {
    status: HttpStatus.CONFLICT,
    error: {
      code: 'RELATED_RECORD_CONFLICT',
      message: 'Record is linked to other data',
    },
  },
  P2025: {
    status: HttpStatus.NOT_FOUND,
    error: { code: 'RECORD_NOT_FOUND', message: 'Record not found' },
  },
};

// body-parser ปฏิเสธ request ที่ใหญ่เกินเพดาน (เช่น ไฟล์นำเข้าขนาดใหญ่) — ความผิดของ request ไม่ใช่ของระบบ
const PAYLOAD_TOO_LARGE: { status: number; error: ErrorDetail } = {
  status: HttpStatus.PAYLOAD_TOO_LARGE,
  error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
};

function isPayloadTooLarge(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'type' in exception &&
    exception.type === 'entity.too.large'
  );
}

// แปลง error ทุกชนิดเป็นรูปแบบเดียว: { "error": { "code", "message", "details"?, "requestId" } }
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const { status, error } = this.toResponse(exception);
    // requestId ให้ผู้ใช้แจ้งปัญหาแล้วทีมค้น log บรรทัดเดียวกันได้
    const requestId = typeof request.id === 'string' ? request.id : undefined;
    const body: ErrorBody = { error: { ...error, requestId } };
    http.getResponse<Response>().status(status).json(body);
  }

  private toResponse(exception: unknown): {
    status: number;
    error: ErrorDetail;
  } {
    if (exception instanceof ApiException) {
      const { code, message, details } = exception;
      return {
        status: exception.getStatus(),
        error: { code, message, details },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        error: {
          code: HttpStatus[status] ?? 'HTTP_ERROR',
          message: exception.message,
        },
      };
    }
    if (isPayloadTooLarge(exception)) return PAYLOAD_TOO_LARGE;
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const known = PRISMA_ERRORS[exception.code];
      if (known) return known;
    }
    // error ที่ไม่คาดคิด: เก็บรายละเอียดไว้ใน log ไม่ส่งให้ client
    this.logger.error(exception);
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    };
  }
}
