import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';

// [เรา] แจ้งเตือนที่ส่งแล้ว (NotificationLog) — เก็บเป็นข้อความ และใช้ CHECK constraint ของตารางคุมค่า
export type NotificationType =
  | 'PARKING_EXPIRING' // ล่วงหน้าก่อนหมดเวลาจอด
  | 'PARKING_OVERTIME' // แจ้งเจ้าหน้าที่ตรวจสอบเมื่อหมดเวลา
  | 'PAYMENT_DUE'
  | 'BOOKING_CANCELLED'
  | 'FINE_ISSUED'; // แจ้งลูกค้าเมื่อผู้ตรวจบันทึกค่าปรับ (ค่าปรับค้างชำระปิดสิทธิ์จอง ลูกค้าต้องรู้)

export type NotificationView = {
  id: number;
  // หน้าเว็บแปล type เป็นข้อความตามภาษาของผู้ใช้; detail คือเลขที่การจองและช่องจอด
  type: NotificationType;
  detail: string;
  read: boolean;
  createdAt: string;
  // ปลายทางเมื่อแตะแจ้งเตือน: ใบจอง หรือค่าปรับ (ไม่มี = ไม่มีหน้าเฉพาะ)
  bookingNo: string | null;
  fineId: number | null;
};

// ปลายทางอ่านจาก dedupeKey ที่งานแจ้งเตือนตั้งไว้ ("expiring:BK2026-11-0001:2026-11-10", "fine:12")
// เก็บรูปแบบนี้ที่เดียวกับที่สร้าง (jobs.service.ts, fine.service.ts) — ไม่ต้องเพิ่มคอลัมน์ในตาราง
const BOOKING_NO_IN_KEY = /(BK\d{4}-\d{2}-\d{4})/;
const FINE_KEY = /^fine:(\d+)$/;

export function targetOf(dedupeKey: string): {
  bookingNo: string | null;
  fineId: number | null;
} {
  const fine = FINE_KEY.exec(dedupeKey);
  if (fine) return { bookingNo: null, fineId: Number(fine[1]) };
  return {
    bookingNo: BOOKING_NO_IN_KEY.exec(dedupeKey)?.[1] ?? null,
    fineId: null,
  };
}

export type NotificationList = {
  unreadCount: number;
  items: NotificationView[];
};

const LIST_LIMIT = 30;

function recipientOf(user: AuthUser) {
  return {
    recipientType: user.type === 'EMPLOYEE' ? 'EMPLOYEE' : 'CUSTOMER',
    recipientCode: user.id,
  };
}

// [ถาม ข้อ 5] ตอนนี้แจ้งเตือนในเว็บอย่างเดียว รอคำตอบเรื่องช่องทางภายนอก (SMS / LINE)
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser): Promise<NotificationList> {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where: recipientOf(user),
        orderBy: { id: 'desc' },
        take: LIST_LIMIT,
      }),
      this.prisma.notificationLog.count({
        where: { ...recipientOf(user), readAt: null },
      }),
    ]);
    return {
      unreadCount,
      items: items.map((item) => ({
        id: item.id,
        type: item.type as NotificationType,
        detail: item.body,
        read: item.readAt !== null,
        createdAt: item.createdDate.toISOString(),
        ...targetOf(item.dedupeKey ?? ''),
      })),
    };
  }

  async markAllRead(user: AuthUser): Promise<void> {
    await this.prisma.notificationLog.updateMany({
      where: { ...recipientOf(user), readAt: null },
      data: { readAt: new Date() },
    });
  }
}
