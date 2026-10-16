import { Module } from '@nestjs/common';
import { CrmClient, MockCrmClient } from './crm.client.js';

@Module({
  // env.crmMode มีแค่ 'mock' — เพิ่มตัวเชื่อมจริงแล้วเลือกตาม mode ที่นี่
  providers: [{ provide: CrmClient, useClass: MockCrmClient }],
  exports: [CrmClient],
})
export class CrmModule {}
