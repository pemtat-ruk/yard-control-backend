import { Module } from '@nestjs/common';
import { PaymentModule } from '../payment/payment.module.js';
import { FineController } from './fine.controller.js';
import { FineService } from './fine.service.js';

@Module({
  imports: [PaymentModule],
  controllers: [FineController],
  providers: [FineService],
})
export class FineModule {}
