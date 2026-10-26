import { Controller, type MessageEvent, Sse } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Observable } from 'rxjs';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { EventsService } from './events.service.js';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Sse()
  @ApiOperation({
    summary:
      'SSE: แจ้งหน้าเว็บเมื่อข้อมูลเปลี่ยน (slots / payment / notification) ให้โหลดใหม่ทันที',
  })
  stream(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return this.events.streamFor(user.id);
  }
}
