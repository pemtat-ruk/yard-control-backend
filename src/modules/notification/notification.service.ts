import { Injectable } from '@nestjs/common';
import type { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';

export type NotificationView = {
  id: number;
  // หน้าเว็บแปล type เป็นข้อความตามภาษาของผู้ใช้; detail คือเลขที่การจองและช่องจอด
  type: NotificationType;
  detail: string;
  read: boolean;
  createdAt: string;
};

export type NotificationList = {
  unreadCount: number;
  items: NotificationView[];
};

const LIST_LIMIT = 30;

// [ถาม ข้อ 5] ตอนนี้แจ้งเตือนในเว็บอย่างเดียว รอคำตอบเรื่องช่องทางภายนอก (SMS / LINE)
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser): Promise<NotificationList> {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { id: 'desc' },
        take: LIST_LIMIT,
      }),
      this.prisma.notification.count({
        where: { userId: user.id, readAt: null },
      }),
    ]);
    return {
      unreadCount,
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        detail: item.body,
        read: item.readAt !== null,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  async markAllRead(user: AuthUser): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
