import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CreateRateDto } from './dto/create-rate.dto.js';
import { PricingService, type RateView } from './pricing.service.js';

@ApiTags('pricing')
@RequirePermission('PRICING_MANAGE')
@Controller('rates')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get()
  @ApiOperation({ summary: 'ประวัติอัตราค่าบริการ ล่าสุดอยู่บนสุด' })
  list(): Promise<RateView[]> {
    return this.pricingService.list();
  }

  @Post()
  @ApiOperation({ summary: 'กำหนดอัตราใหม่ตามหนังสืออนุญาต' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRateDto,
  ): Promise<RateView[]> {
    return this.pricingService.create(user, dto);
  }
}
