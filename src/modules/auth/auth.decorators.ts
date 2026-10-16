import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from './auth.types.js';
import type { Permission } from './domain/permissions.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';

// endpoint ที่ไม่ต้อง login (ค่าตั้งต้นคือทุก endpoint ต้อง login)
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// ต้องมีสิทธิ์อย่างน้อยหนึ่งตัวในรายการ (ข้อ 2)
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // AuthGuard รับประกันว่ามี user ใน endpoint ที่ไม่ได้ติด @Public()
    return request.user as AuthUser;
  },
);
