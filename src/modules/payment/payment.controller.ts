import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PaymentService, type PaymentView } from './payment.service.js';

@ApiTags('payment')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'สถานะการชำระเงินและ QR (หน้าเว็บเรียกซ้ำเพื่อรอผล)',
  })
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PaymentView> {
    return this.paymentService.getView(user, id);
  }

  @Post(':id/mock-pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'จำลองว่าชำระสำเร็จ (ใช้ได้เฉพาะ PAYMENT_GATEWAY_MODE=mock)',
  })
  mockPay(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PaymentView> {
    return this.paymentService.mockPay(user, id);
  }
}
