import { HttpException } from '@nestjs/common';

// error ที่ตั้งใจส่งให้ client: code ให้โปรแกรมใช้ตัดสินใจ, message ให้คนอ่าน
export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: string[],
  ) {
    super(message, status);
  }
}
