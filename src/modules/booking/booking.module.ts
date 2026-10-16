import { Module } from '@nestjs/common';
import { PaymentModule } from '../payment/payment.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { BookingImportController } from './booking-import.controller.js';
import { BookingImportService } from './booking-import.service.js';
import { BookingController } from './booking.controller.js';
import { BookingService } from './booking.service.js';

@Module({
  imports: [PricingModule, PaymentModule],
  // import controller ก่อน: path bookings/import ต้องไม่ถูกจับเป็น bookings/:id
  controllers: [BookingImportController, BookingController],
  providers: [BookingService, BookingImportService],
})
export class BookingModule {}
