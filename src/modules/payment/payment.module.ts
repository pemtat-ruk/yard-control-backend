import { Module } from '@nestjs/common';
import { MockPaymentGateway, PaymentGateway } from './payment-gateway.js';
import { PaymentController } from './payment.controller.js';
import { PaymentService } from './payment.service.js';

@Module({
  controllers: [PaymentController],
  providers: [
    PaymentService,
    // env.paymentGatewayMode มีแค่ 'mock' — เพิ่มตัวเชื่อมจริงแล้วเลือกตาม mode ที่นี่
    { provide: PaymentGateway, useClass: MockPaymentGateway },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
