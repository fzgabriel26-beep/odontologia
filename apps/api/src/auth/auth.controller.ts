import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@odonto/validation';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@odonto/validation';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthRateLimit } from '../common/decorators/auth-rate-limit.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  readCookie,
  setSessionCookie,
  type CookieResponse,
} from '../common/utils/cookie';
import { AuthService, type AuthResult } from './auth.service';

interface RequestWithUser {
  headers: { cookie?: string; 'user-agent'?: string };
  ip?: string;
  user?: AuthUser;
}

function contextOf(req: RequestWithUser): { ip?: string; userAgent?: string } {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

function respondWithSession(res: CookieResponse, result: AuthResult): { user: AuthResult['user'] } {
  setSessionCookie(res, result.token, result.expiresAt);
  return { user: result.user };
}

/**
 * Endpoints de autenticación (SDD §6, fase 2).
 * Todos los roles comparten el 100% de permisos de escritura en MVP (ADR-004).
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @AuthRateLimit()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ user: AuthResult['user'] }> {
    const result = await this.authService.login(body, contextOf(req));
    return respondWithSession(res, result);
  }

  @AuthRateLimit()
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ ok: true }> {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    // El SessionGuard garantiza req.user en rutas no públicas.
    await this.authService.logout(token, req.user, contextOf(req));
    clearSessionCookie(res);
    return { ok: true };
  }

  @AuthRateLimit()
  @Get('me')
  async me(@CurrentUser() authUser: AuthUser): Promise<{ user: AuthResult['user'] }> {
    return { user: this.authService.me(authUser) };
  }

  @Public()
  @AuthRateLimit()
  @Post('register')
  @HttpCode(201)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ user: AuthResult['user'] }> {
    const result = await this.authService.register(body, contextOf(req));
    return respondWithSession(res, result);
  }

  @Public()
  @AuthRateLimit()
  @Post('password/forgot')
  @HttpCode(202)
  async forgot(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: RequestWithUser,
  ): Promise<{ ok: true }> {
    await this.authService.forgotPassword(body, contextOf(req));
    // Respuesta idéntica exista o no el email (evita enumeración de usuarios).
    return { ok: true };
  }

  @Public()
  @AuthRateLimit()
  @Post('password/reset')
  @HttpCode(200)
  async reset(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: RequestWithUser,
  ): Promise<{ ok: true }> {
    await this.authService.resetPassword(body, contextOf(req));
    return { ok: true };
  }

  @AuthRateLimit()
  @Post('password/change')
  @HttpCode(200)
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @CurrentUser() authUser: AuthUser,
    @Req() req: RequestWithUser,
  ): Promise<{ ok: true }> {
    await this.authService.changePassword(
      authUser,
      body.currentPassword,
      body.newPassword,
      contextOf(req),
    );
    return { ok: true };
  }
}
