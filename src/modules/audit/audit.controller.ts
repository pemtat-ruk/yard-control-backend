import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/auth.decorators.js';
import { AuditQueryDto } from './audit-query.dto.js';
import { AuditService, type AuditView } from './audit.service.js';

// ประวัติการใช้งานระบบ: ฝ่าย IT ตรวจย้อนหลังว่าใครทำอะไรเมื่อไร
@ApiTags('audit')
@RequirePermission('SETTINGS_MANAGE')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'ค้นประวัติการใช้งาน ใหม่สุดก่อน ทีละหน้า' })
  list(@Query() query: AuditQueryDto): Promise<AuditView[]> {
    return this.auditService.list(query);
  }
}
