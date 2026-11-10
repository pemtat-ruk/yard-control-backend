import type { UserType } from './permissions.js';

// CRMCustomer.CusType: Labor = แรงงาน (เสื้อเขียว), buyer = ผู้ซื้อ
export type CusType = 'Labor' | 'buyer';

export function userTypeOf(cusType: string | null): 'GREEN_SHIRT' | 'BUYER' {
  return cusType === 'Labor' ? 'GREEN_SHIRT' : 'BUYER';
}

export function cusTypeOf(userType: UserType): CusType {
  return userType === 'GREEN_SHIRT' ? 'Labor' : 'buyer';
}

export function customerName(customer: {
  firstName: string | null;
  lastName: string | null;
}): string {
  return [customer.firstName, customer.lastName]
    .filter((part) => part && part.trim())
    .join(' ');
}

// ชื่อจาก CRM มาเป็นข้อความเดียว: คำแรกเป็นชื่อ ที่เหลือเป็นนามสกุล
export function splitName(fullName: string): {
  firstName: string;
  lastName: string | null;
} {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  return { firstName: first ?? '', lastName: rest.join(' ') || null };
}

// รหัสผู้ขอใช้บริการ C + เลข 5 หลัก (C00001)
const CUS_ID_DIGITS = 5;
export function formatCusId(sequence: number): string {
  return `C${String(sequence).padStart(CUS_ID_DIGITS, '0')}`;
}

export function nextCusId(lastCusId: string | null): string {
  const last = lastCusId ? Number(lastCusId.slice(1)) : 0;
  return formatCusId((Number.isFinite(last) ? last : 0) + 1);
}

// ผู้ใช้ใน session: E:<EmpCode> หรือ C:<CusId>
export type Subject =
  { kind: 'EMPLOYEE'; code: string } | { kind: 'CUSTOMER'; code: string };

export function formatSubject(subject: Subject): string {
  return `${subject.kind === 'EMPLOYEE' ? 'E' : 'C'}:${subject.code}`;
}

export function parseSubject(text: string): Subject | null {
  const [prefix, code] = [text.slice(0, 2), text.slice(2)];
  if (!code) return null;
  if (prefix === 'E:') return { kind: 'EMPLOYEE', code };
  if (prefix === 'C:') return { kind: 'CUSTOMER', code };
  return null;
}
