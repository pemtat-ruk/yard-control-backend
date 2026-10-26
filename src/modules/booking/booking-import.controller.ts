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
import {
  BookingImportService,
  type ImportedBooking,
  type ImportHistoryItem,
  type ImportPreview,
  type ImportResult,
} from './booking-import.service.js';
import { ImportBookingsDto } from './dto/import-bookings.dto.js';
import { PublishesSlots } from '../events/publishes-slots.js';

// ข้อ 2: นำข้อมูลจองช่องจอดของลูกค้าประจำ (ฝ่ายบริการลูกค้า)
@ApiTags('booking')
@RequirePermission('BOOKING_IMPORT_LONG_TERM')
@Controller('bookings/import')
export class BookingImportController {
  constructor(private readonly importService: BookingImportService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ตรวจไฟล์นำเข้ารายแถวโดยยังไม่บันทึก' })
  preview(@Body() dto: ImportBookingsDto): Promise<ImportPreview> {
    return this.importService.preview(dto.csv);
  }

  @PublishesSlots()
  @Post()
  @ApiOperation({ summary: 'นำเข้าทั้งไฟล์ (ทุกแถวต้องผ่าน)' })
  commit(
    @CurrentUser() user: AuthUser,
    @Body() dto: ImportBookingsDto,
  ): Promise<ImportResult> {
    return this.importService.commit(user, dto.csv, dto.fileName);
  }

  @Get('history')
  @ApiOperation({ summary: 'รายการไฟล์ที่นำเข้าแล้ว (ใคร เมื่อไร กี่รายการ)' })
  history(): Promise<ImportHistoryItem[]> {
    return this.importService.history();
  }

  @Get('history/:id')
  @ApiOperation({
    summary: 'การจองที่สร้างจากไฟล์ที่นำเข้าหนึ่งครั้ง พร้อมสถานะปัจจุบัน',
  })
  historyDetail(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ImportedBooking[]> {
    return this.importService.historyDetail(id);
  }
}
