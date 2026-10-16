import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/auth.decorators.js';
import { BookingReportQueryDto } from './dto/booking-report-query.dto.js';
import { PaymentReportQueryDto } from './dto/payment-report-query.dto.js';
import {
  ReportService,
  type BookingReport,
  type Dashboard,
  type PaymentReport,
} from './report.service.js';

@ApiTags('report')
@RequirePermission('REPORT_VIEW')
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('payments')
  @ApiOperation({ summary: 'สรุปยอดชำระค่าบริการและค่าปรับตามช่วงวันเวลา' })
  payments(@Query() query: PaymentReportQueryDto): Promise<PaymentReport> {
    return this.reportService.paymentSummary(query);
  }

  @Get('bookings')
  @ApiOperation({ summary: 'รายการจองพร้อมสถานะการชำระ กรองได้หลายเงื่อนไข' })
  bookings(@Query() query: BookingReportQueryDto): Promise<BookingReport> {
    return this.reportService.bookingReport(query);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'ภาพรวมการจอง การชำระเงิน และการใช้ลานจอด' })
  dashboard(@Query() query: BookingReportQueryDto): Promise<Dashboard> {
    return this.reportService.dashboard(query);
  }
}
