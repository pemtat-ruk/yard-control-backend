import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../../common/api-exception.js';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from './auth.decorators.js';
import { AuthService, SESSION_COOKIE } from './auth.service.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { hasPermission, type Permission } from './domain/permissions.js';

function readCookie(header: string | undefined, name: string) {
  const prefix = `${name}=`;
  const entry = header?.split('; ').find((item) => item.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : undefined;
}

// ตรวจ session และสิทธิ์ของทุก endpoint — การซ่อนปุ่มที่หน้าเว็บไม่นับเป็นการป้องกัน
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    const user = await this.authService.findUserByToken(token);
    request.user = user ?? undefined;

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    if (!user) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_REQUIRED',
        'Sign in is required',
      );
    }

    const required =
      this.reflector.getAllAndOverride<Permission[]>(
        PERMISSIONS_KEY,
        targets,
      ) ?? [];
    const allowed =
      required.length === 0 ||
      required.some((permission) => hasPermission(user, permission));
    if (!allowed) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'PERMISSION_DENIED',
        'You do not have permission for this action',
      );
    }
    return true;
  }
}
