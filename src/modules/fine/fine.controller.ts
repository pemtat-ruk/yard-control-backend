import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CreateFineDto, FineTargetDto } from './dto/create-fine.dto.js';
import type { OvertimeFine } from './domain/fine-amount.js';
import { FineService, type FineView } from './fine.service.js';

@ApiTags('fine')
@Controller('fines')
export class FineController {
  constructor(private readonly fineService: FineService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('SLOT_INSPECT')
  @ApiOperation({ summary: 'คำนวณค่าปรับจอดเกินเวลา ณ ตอนนี้ (ยังไม่บันทึก)' })
  quote(@Body() dto: FineTargetDto): Promise<OvertimeFine> {
    return this.fineService.quote(dto);
  }

  @Post()
  @RequirePermission('SLOT_INSPECT')
  @ApiOperation({ summary: 'บันทึกค่าปรับและสร้างรายการรอชำระ' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFineDto,
  ): Promise<{ fineId: number; paymentId: number; amount: number }> {
    return this.fineService.create(user, dto);
  }

  @Post(':id/payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'รายการชำระของค่าปรับ: ออก QR ใหม่ถ้าของเดิมหมดอายุ',
  })
  renewPayment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ paymentId: number }> {
    return this.fineService.renewPayment(user, id);
  }

  @Get()
  @ApiOperation({ summary: 'รายการค่าปรับ: ของตนเอง หรือทั้งหมดสำหรับพนักงาน' })
  list(@CurrentUser() user: AuthUser): Promise<FineView[]> {
    return this.fineService.list(user);
  }
}
