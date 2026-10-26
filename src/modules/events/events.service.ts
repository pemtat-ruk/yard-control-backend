import { Injectable, type MessageEvent } from '@nestjs/common';
import { filter, interval, map, merge, Subject, type Observable } from 'rxjs';

// ชนิดเหตุการณ์ที่ส่งให้หน้าเว็บผ่าน SSE — หน้าเว็บได้รับแล้วโหลดข้อมูลใหม่เอง (เหตุการณ์ไม่มีข้อมูลธุรกิจ)
export type ServerEventType = 'slots' | 'payment' | 'notification';

type ServerEvent = {
  type: ServerEventType;
  // null = ทุกคนที่เชื่อมต่ออยู่
  userIds: number[] | null;
  data: Record<string, unknown>;
};

// proxy บางตัวตัดการเชื่อมต่อที่เงียบนาน จึงส่ง ping เป็นระยะ
const HEARTBEAT_MS = 25 * 1000;

// ตัวกระจายเหตุการณ์ในหน่วยความจำของ process (instance เดียว)
// รันหลาย instance ต้องเปลี่ยนเป็นตัวกลาง เช่น Redis pub/sub — ผู้เรียกไม่ต้องแก้
@Injectable()
export class EventsService {
  private readonly events = new Subject<ServerEvent>();

  // สถานะช่องจอดเปลี่ยน: จอง, QR หมดอายุ, ยกเลิก, ตรวจสอบ, จัดการผัง, ขึ้นรอบใหม่
  slotsChanged(): void {
    this.events.next({ type: 'slots', userIds: null, data: {} });
  }

  // ชำระสำเร็จ: ส่งให้เจ้าของรายการและผู้ทำรายการ (หน้า QR เปลี่ยนเป็นตั๋ว/ใบเสร็จทันที)
  paymentSettled(paymentId: number, userIds: number[]): void {
    this.events.next({ type: 'payment', userIds, data: { paymentId } });
  }

  // มีการแจ้งเตือนใหม่: กระดิ่งของผู้รับโหลดใหม่ทันที
  notificationsCreated(userIds: number[]): void {
    if (userIds.length === 0) return;
    this.events.next({
      type: 'notification',
      userIds: [...new Set(userIds)],
      data: {},
    });
  }

  streamFor(userId: number): Observable<MessageEvent> {
    return merge(
      this.events.pipe(
        filter(
          (event) => event.userIds === null || event.userIds.includes(userId),
        ),
        map((event) => ({ type: event.type, data: event.data })),
      ),
      interval(HEARTBEAT_MS).pipe(map(() => ({ type: 'ping', data: {} }))),
    );
  }
}
