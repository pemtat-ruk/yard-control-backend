import { Injectable } from '@nestjs/common';

export type QrRequest = {
  transactionNo: string;
  amount: number;
  expiresAt: Date;
};
export type QrResult = { qrPayload: string; gatewayRef: string };

// ข้อ 6.2: ทุกการชำระเงินผ่าน QR Payment ของ Payment Gateway กลาง
// โมดูลอื่นพึ่ง class นี้เท่านั้น เมื่อได้ spec จริงให้เพิ่ม class ที่เรียก Gateway แล้วสลับใน PaymentModule
// และเพิ่ม endpoint รับ webhook ที่เรียก PaymentService.settle() แทนปุ่มจำลองการชำระ
export abstract class PaymentGateway {
  abstract createQr(request: QrRequest): Promise<QrResult>;
}

// ตัวจำลอง: QR เป็นข้อความที่บอกชัดว่าไม่ใช่ของจริง สแกนแล้วจ่ายเงินไม่ได้
@Injectable()
export class MockPaymentGateway extends PaymentGateway {
  createQr({ transactionNo, amount }: QrRequest): Promise<QrResult> {
    return Promise.resolve({
      qrPayload: `YCS-MOCK-QR|${transactionNo}|${amount.toFixed(2)}`,
      gatewayRef: `MOCK-${transactionNo}`,
    });
  }
}
