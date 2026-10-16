import { Injectable } from '@nestjs/common';

export type CrmLookup = { phone: string; laborCardNo?: string };
export type CrmCustomer = { crmId: string; fullName: string };

// ข้อ 1: ผู้ขอใช้บริการต้องมีข้อมูลใน CRM ก่อนลงทะเบียน
// โมดูลอื่นพึ่ง class นี้เท่านั้น เมื่อได้ API spec ของ CRM ให้เพิ่ม class ที่เรียก API จริงแล้วสลับใน CrmModule
export abstract class CrmClient {
  abstract findCustomer(lookup: CrmLookup): Promise<CrmCustomer | null>;
}

// เบอร์ที่ลงท้ายด้วยเลขนี้ถือว่า "ไม่พบใน CRM" เพื่อให้ทดสอบกรณีลงทะเบียนไม่ผ่านได้
const MOCK_NOT_FOUND_SUFFIX = '0000';
const NAME_DIGITS = 4;

// ตัวจำลอง: ตอบว่าพบข้อมูลของทุกเบอร์ ยกเว้นเบอร์ที่ลงท้าย 0000
@Injectable()
export class MockCrmClient extends CrmClient {
  findCustomer({ phone }: CrmLookup): Promise<CrmCustomer | null> {
    if (phone.endsWith(MOCK_NOT_FOUND_SUFFIX)) return Promise.resolve(null);
    return Promise.resolve({
      crmId: `MOCK-${phone}`,
      fullName: `ลูกค้า ${phone.slice(-NAME_DIGITS)}`,
    });
  }
}
