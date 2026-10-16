import { randomUUID } from 'node:crypto';
import type { SerializedRequest, SerializedResponse } from 'pino';
import type { Options } from 'pino-http';
import { env } from '../config/env.js';

export const REQUEST_ID_HEADER = 'x-request-id';
// รับ request id จาก client เฉพาะรูปแบบที่ปลอดภัย กันการยัดข้อความแปลกปลอมลง log
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
// ค่าที่ห้ามออก log ไม่ว่ากรณีใด
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];
// endpoint ที่ระบบ monitor เรียกถี่ ไม่ต้อง log ทุกครั้ง
const UNLOGGED_PATH_SUFFIXES = ['/health', '/ready'];

const SERVER_ERROR_STATUS = 500;
const CLIENT_ERROR_STATUS = 400;

export function resolveRequestId(inbound: string | string[] | undefined) {
  return typeof inbound === 'string' && REQUEST_ID_PATTERN.test(inbound)
    ? inbound
    : randomUUID();
}

// log 1 บรรทัด JSON ต่อ request ออก stdout พร้อม request id ที่ส่งกลับใน header เดียวกัน
export const httpLoggerOptions: Options = {
  level: env.logLevel,
  redact: REDACTED_PATHS,
  // log เฉพาะ field ที่ระบุ — header (token, cookie) และ body (เบอร์โทร, บัตรแรงงาน) ไม่ออก log
  // redact ด้านบนยังคงไว้เป็นชั้นที่สอง เผื่อมีคนเพิ่ม header กลับเข้ามาในอนาคต
  serializers: {
    req: (request: SerializedRequest) => ({
      id: request.id,
      method: request.method,
      url: request.url,
      ip: request.remoteAddress,
    }),
    res: (response: SerializedResponse) => ({
      statusCode: response.statusCode,
    }),
  },
  genReqId: (request, response) => {
    const id = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
    response.setHeader(REQUEST_ID_HEADER, id);
    return id;
  },
  customLogLevel: (_request, response, error) => {
    if (error || response.statusCode >= SERVER_ERROR_STATUS) return 'error';
    if (response.statusCode >= CLIENT_ERROR_STATUS) return 'warn';
    return 'info';
  },
  autoLogging: {
    ignore: (request) => {
      const path = request.url?.split('?')[0] ?? '';
      return UNLOGGED_PATH_SUFFIXES.some((suffix) => path.endsWith(suffix));
    },
  },
};
