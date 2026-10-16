import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CreateRoundConfigDto } from './dto/create-round-config.dto.js';
import { RoundsService, type RoundConfigList } from './rounds.service.js';

// ข้อ 2: ฟังก์ชันกำหนดเวลาและราคาช่องจอด (ฝ่าย IT) — หน้าตั้งค่าระบบ
@ApiTags('rounds')
@RequirePermission('PRICING_MANAGE', 'SETTINGS_MANAGE')
@Controller('rounds/configs')
export class RoundsController {
  constructor(private readonly roundsService: RoundsService) {}

  @Get()
  @ApiOperation({
    summary: 'ประวัติตารางรอบ (ล่าสุดอยู่บนสุด) และวันแรกที่ตั้งตารางใหม่ได้',
  })
  list(): Promise<RoundConfigList> {
    return this.roundsService.listWithEarliest();
  }

  @Post()
  @ApiOperation({
    summary: 'ตั้งตารางรอบใหม่ มีผลตั้งแต่วันที่ (หลังช่วงจองล่วงหน้า)',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRoundConfigDto,
  ): Promise<RoundConfigList> {
    return this.roundsService.create(user, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ยกเลิกตารางรอบที่ยังไม่เปิดให้จอง' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<RoundConfigList> {
    return this.roundsService.remove(user, id);
  }
}
