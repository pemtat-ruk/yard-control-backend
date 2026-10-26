import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  Public,
  RequirePermission,
} from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  BookingService,
  type BookingQuote,
  type BookingSchedule,
  type BookingView,
  type CustomerView,
  type RoundsConfig,
} from './booking.service.js';
import {
  CreateBookingDto,
  PayDaysDto,
  SearchQueryDto,
} from './dto/create-booking.dto.js';
import { QuoteBookingDto } from './dto/quote-booking.dto.js';
import { RoundsQueryDto } from './dto/rounds-query.dto.js';
import { PublishesSlots } from '../events/publishes-slots.js';

// controller ทำแค่รับ request และเรียก service — ไม่มี business logic ในไฟล์นี้
@ApiTags('booking')
@Controller()
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Public()
  @Get('rounds')
  @ApiOperation({ summary: 'รอบการจองและจำนวนวันที่จองล่วงหน้าได้' })
  getRounds(@Query() query: RoundsQueryDto): Promise<RoundsConfig> {
    return this.bookingService.getRoundsConfig(query.date);
  }

  @Public()
  @Post('bookings/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'คำนวณยอดและตารางชำระเงินก่อนยืนยันการจอง' })
  quote(@Body() dto: QuoteBookingDto): Promise<BookingQuote> {
    return this.bookingService.quote(dto);
  }

  @PublishesSlots()
  @Post('bookings')
  @RequirePermission('BOOKING_CREATE_SELF', 'BOOKING_CREATE_ON_BEHALF')
  @ApiOperation({ summary: 'สร้างการจองและรายการรอชำระเงิน' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBookingDto,
  ): Promise<BookingView> {
    return this.bookingService.create(user, dto);
  }

  @Get('bookings')
  @ApiOperation({
    summary: 'รายการจอง: ของตนเอง หรือทั้งหมดพร้อมค้นหาสำหรับพนักงาน',
  })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: SearchQueryDto,
  ): Promise<BookingView[]> {
    return this.bookingService.list(user, query.q);
  }

  // ต้องอยู่ก่อน bookings/:id ไม่เช่นนั้น "schedule" จะถูกอ่านเป็น id
  @Get('bookings/schedule')
  @ApiOperation({
    summary: 'ตารางการจองของตนเอง: ที่กำลังใช้อยู่และที่ยังมาไม่ถึง',
  })
  schedule(@CurrentUser() user: AuthUser): Promise<BookingSchedule> {
    return this.bookingService.getSchedule(user);
  }

  @Get('bookings/:id')
  @ApiOperation({ summary: 'รายละเอียดการจอง ตั๋ว และใบเสร็จ' })
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<BookingView> {
    return this.bookingService.get(user, id);
  }

  @Post('bookings/:id/pay-days')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ชำระค่าบริการรายวันของการจองแบบวันต่อวัน' })
  payDays(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayDaysDto,
  ): Promise<BookingView> {
    return this.bookingService.payDays(user, id, dto);
  }

  @Get('customers')
  @RequirePermission('BOOKING_CREATE_ON_BEHALF')
  @ApiOperation({ summary: 'ค้นหาผู้ขอใช้บริการเพื่อจองแทน' })
  searchCustomers(@Query() query: SearchQueryDto): Promise<CustomerView[]> {
    return this.bookingService.searchCustomers(query.q);
  }
}
