import type { Request } from 'express';
import type { Department, Permission, UserType } from './domain/permissions.js';

// ผู้ใช้ที่ login อยู่ — guard ใส่ไว้ใน request.user และส่งให้หน้าเว็บผ่าน GET /auth/me
export type AuthUser = {
  id: number;
  name: string;
  type: UserType;
  department: Department | null;
  // ตัวระบุตัวตนที่แสดงในหน้าข้อมูลส่วนตัว: ผู้ขอใช้บริการมีเบอร์โทร (+ เลขบัตรแรงงานสำหรับเสื้อเขียว), พนักงานมีรหัสพนักงาน
  phone: string | null;
  laborCardNo: string | null;
  employeeCode: string | null;
  permissions: Permission[];
};

export type AuthenticatedRequest = Request & { user?: AuthUser };
