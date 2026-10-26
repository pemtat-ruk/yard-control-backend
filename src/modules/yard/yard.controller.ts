import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  AvailabilityQueryDto,
  CreateLotDto,
  CreateSlotDto,
  RecordInspectionDto,
  UpdateLotDto,
  UpdateSlotStatusDto,
} from './dto/yard.dto.js';
import {
  YardService,
  type AvailabilitySummary,
  type LayoutLot,
  type LiveYard,
  type SlotView,
} from './yard.service.js';
import { PublishesSlots } from '../events/publishes-slots.js';

@ApiTags('yard')
@Controller('yard')
export class YardController {
  constructor(private readonly yardService: YardService) {}

  @Get('availability')
  @ApiOperation({ summary: 'สถานะช่องจอด ณ ช่วงเวลาที่จะจอง' })
  availability(
    @CurrentUser() user: AuthUser,
    @Query() query: AvailabilityQueryDto,
  ): Promise<SlotView[]> {
    return this.yardService.getAvailability(user, query);
  }

  @Get('availability/summary')
  @ApiOperation({
    summary:
      'จำนวนช่องว่างของแต่ละรอบเริ่มและแต่ละวันที่จองได้ (สำหรับปุ่มในหน้าจอง)',
  })
  availabilitySummary(
    @CurrentUser() user: AuthUser,
    @Query() query: AvailabilityQueryDto,
  ): Promise<AvailabilitySummary> {
    return this.yardService.getAvailabilitySummary(user, query);
  }

  @Get('live')
  @ApiOperation({ summary: 'สถานะช่องจอด ณ เวลานี้ รวมช่องที่หมดเวลา' })
  live(@CurrentUser() user: AuthUser): Promise<LiveYard> {
    return this.yardService.getLive(user);
  }

  @PublishesSlots()
  @Post('inspections')
  @RequirePermission('SLOT_INSPECT')
  @ApiOperation({ summary: 'บันทึกผลตรวจ: รถออกแล้ว / ยังจอดอยู่' })
  recordInspection(
    @CurrentUser() user: AuthUser,
    @Body() dto: RecordInspectionDto,
  ): Promise<{ id: number }> {
    return this.yardService.recordInspection(user, dto);
  }

  @PublishesSlots()
  @Delete('inspections/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('SLOT_INSPECT')
  @ApiOperation({
    summary: 'เลิกทำ "รถออกแล้ว" (ผู้ตรวจคนเดิม ภายใน 10 นาที)',
  })
  undoInspection(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.yardService.undoInspection(user, id);
  }

  @Get('layout')
  @RequirePermission('LAYOUT_TOGGLE', 'LAYOUT_EDIT')
  @ApiOperation({ summary: 'ลานจอดและช่องจอดทั้งหมดพร้อมสถานะที่ตั้งไว้' })
  layout(): Promise<LayoutLot[]> {
    return this.yardService.getLayout();
  }

  @PublishesSlots()
  @Post('lots')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('LAYOUT_EDIT')
  @ApiOperation({ summary: 'เพิ่มลานจอด' })
  createLot(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLotDto,
  ): Promise<void> {
    return this.yardService.createLot(user, dto);
  }

  @PublishesSlots()
  @Patch('lots/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('LAYOUT_TOGGLE')
  @ApiOperation({ summary: 'เปลี่ยนชื่อ หรือเปิด/ปิดทั้งลานจอด' })
  updateLot(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLotDto,
  ): Promise<void> {
    return this.yardService.updateLot(user, id, dto);
  }

  @PublishesSlots()
  @Delete('lots/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('LAYOUT_EDIT')
  @ApiOperation({ summary: 'ลบลานจอดและช่องจอดในลาน' })
  deleteLot(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.yardService.deleteLot(user, id);
  }

  @PublishesSlots()
  @Post('slots')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('LAYOUT_EDIT')
  @ApiOperation({ summary: 'เพิ่มช่องจอด' })
  createSlot(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSlotDto,
  ): Promise<void> {
    return this.yardService.createSlot(user, dto);
  }

  @PublishesSlots()
  @Patch('slots/:id/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('LAYOUT_TOGGLE')
  @ApiOperation({ summary: 'เปิด / ปิด / สงวนสิทธิ์ ช่องจอด' })
  updateSlotStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSlotStatusDto,
  ): Promise<void> {
    return this.yardService.updateSlotStatus(user, id, dto);
  }

  @PublishesSlots()
  @Delete('slots/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('LAYOUT_EDIT')
  @ApiOperation({ summary: 'ลบช่องจอด' })
  deleteSlot(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.yardService.deleteSlot(user, id);
  }
}
