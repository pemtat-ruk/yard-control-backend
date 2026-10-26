import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { tap, type Observable } from 'rxjs';
import { EventsService } from './events.service.js';

@Injectable()
class PublishSlotsInterceptor implements NestInterceptor {
  constructor(private readonly events: EventsService) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    // ส่งหลังทำรายการสำเร็จเท่านั้น — รายการที่ผิดพลาดไม่เปลี่ยนสถานะช่อง
    return next.handle().pipe(tap(() => this.events.slotsChanged()));
  }
}

// ใส่ที่ endpoint ที่เปลี่ยนสถานะช่องจอด: ผังของทุกคนที่เปิดอยู่โหลดใหม่ทันที (เช่น มีคนจองช่องที่เรากำลังเลือก)
export const PublishesSlots = () => UseInterceptors(PublishSlotsInterceptor);
