import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { env } from '../../config/env.js';
import { CurrentUser, Public, RequirePermission } from './auth.decorators.js';
import {
  AuthService,
  SESSION_COOKIE,
  type VerifiedCustomer,
} from './auth.service.js';
import type { AuthUser } from './auth.types.js';
import { LoginDto, RegisterDto, VerifyCustomerDto } from './dto/auth.dto.js';

const MS_PER_HOUR = 60 * 60 * 1000;
// เพดานต่ำกว่า endpoint ทั่วไป กันการเดารหัสผ่านและการไล่เบอร์โทร
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

// httpOnly: JavaScript ในหน้าเว็บอ่าน session ไม่ได้; sameSite lax: เว็บอื่นส่งคำขอแก้ข้อมูลแทนผู้ใช้ไม่ได้
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.isProduction,
  path: '/',
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'เข้าสู่ระบบ และรับ session cookie' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUser> {
    const { user, token } = await this.authService.login(dto);
    response.cookie(SESSION_COOKIE, token, {
      ...COOKIE_OPTIONS,
      maxAge: env.sessionTtlHours * MS_PER_HOUR,
    });
    return user;
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'ลงทะเบียนเปิดสิทธิ์ (ต้องมีข้อมูลใน CRM)' })
  register(@Body() dto: RegisterDto): Promise<void> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'ออกจากระบบ' })
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
  }

  // เพดานเดียวกับ login: ใช้ไล่เบอร์โทรใน CRM ได้ถ้าไม่จำกัด
  @RequirePermission('BOOKING_CREATE_ON_BEHALF')
  @Throttle(AUTH_THROTTLE)
  @Post('customers/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'ฝ่ายบริการลูกค้าตรวจข้อมูลผู้ขอใช้บริการกับ CRM ก่อนจองแทน (เพิ่ม/อัปเดตใน YCS ให้)',
  })
  verifyCustomer(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyCustomerDto,
  ): Promise<VerifiedCustomer> {
    return this.authService.verifyCustomer(user, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'ผู้ใช้ที่ login อยู่และสิทธิ์ที่มี' })
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
