import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  BookingImportService,
  type ImportPreview,
  type ImportResult,
} from './booking-import.service.js';
import { ImportBookingsDto } from './dto/import-bookings.dto.js';

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

  @Post()
  @ApiOperation({ summary: 'นำเข้าทั้งไฟล์ (ทุกแถวต้องผ่าน)' })
  commit(
    @CurrentUser() user: AuthUser,
    @Body() dto: ImportBookingsDto,
  ): Promise<ImportResult> {
    return this.importService.commit(user, dto.csv);
  }
}
