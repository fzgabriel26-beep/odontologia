import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
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
import { okSchema, sessionUserWrapperSchema } from '../swagger/response-schemas';
import { zodToSchema } from '../swagger/zod-schema';
import { AuthService, type AuthResult } from './auth.service';

interface RequestWithUser {
  headers: { cookie?: string; 'user-agent'?: string; origin?: string };
  ip?: string;
  user?: AuthUser;
}

function contextOf(req: RequestWithUser): { ip?: string; userAgent?: string } {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

function respondWithSession(
  res: CookieResponse,
  result: AuthResult,
  req: RequestWithUser,
): { user: AuthResult['user'] } {
  setSessionCookie(res, result.token, result.expiresAt, { origin: req.headers.origin });
  return { user: result.user };
}

/**
 * Endpoints de autenticación (SDD §6, fase 2).
 * Todos los roles comparten el 100% de permisos de escritura en MVP (ADR-004).
 */
@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @AuthRateLimit()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Valida credenciales y setea la cookie opaca `odon_session` ' +
      '(HttpOnly + Secure + SameSite=None). Rate limit progresivo contra fuerza bruta.',
  })
  @ApiBody({ schema: zodToSchema(loginSchema) })
  @ApiOkResponse({ description: 'Sesión iniciada.', schema: sessionUserWrapperSchema })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ user: AuthResult['user'] }> {
    const result = await this.authService.login(body, contextOf(req));
    return respondWithSession(res, result, req);
  }

  @AuthRateLimit()
  @Post('logout')
  @HttpCode(200)
  @ApiSecurity('sessionCookie')
  @ApiOperation({
    summary: 'Cerrar sesión',
    description: 'Revoca la sesión en servidor y limpia la cookie.',
  })
  @ApiOkResponse({ schema: okSchema })
  async logout(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ ok: true }> {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    // El SessionGuard garantiza req.user en rutas no públicas.
    await this.authService.logout(token, req.user, contextOf(req));
    clearSessionCookie(res, { origin: req.headers.origin });
    return { ok: true };
  }

  @AuthRateLimit()
  @Get('me')
  @ApiSecurity('sessionCookie')
  @ApiOperation({
    summary: 'Usuario autenticado',
    description: 'Devuelve el usuario de la sesión actual con sus permisos (RBAC).',
  })
  @ApiOkResponse({ schema: sessionUserWrapperSchema })
  async me(@CurrentUser() authUser: AuthUser): Promise<{ user: AuthResult['user'] }> {
    return { user: this.authService.me(authUser) };
  }

  @Public()
  @AuthRateLimit()
  @Post('register')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Registrarse con código de invitación',
    description:
      'No existe registro público: exige un código de invitación válido y no revocado ' +
      '(SDD §5 / §13). Crea la cuenta e inicia sesión.',
  })
  @ApiBody({ schema: zodToSchema(registerSchema) })
  @ApiOkResponse({ description: 'Cuenta creada.', schema: sessionUserWrapperSchema })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ user: AuthResult['user'] }> {
    const result = await this.authService.register(body, contextOf(req));
    return respondWithSession(res, result, req);
  }

  @Public()
  @AuthRateLimit()
  @Post('password/forgot')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Solicitar recuperación de contraseña',
    description:
      'Responde igual exista o no el email (evita enumeración de usuarios). ' +
      'En MVP el envío es stub, sin WhatsApp/email reales.',
  })
  @ApiBody({ schema: zodToSchema(forgotPasswordSchema) })
  @ApiAcceptedResponse({ description: 'Solicitud aceptada.', schema: okSchema })
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
  @ApiOperation({
    summary: 'Restablecer contraseña con token',
    description: 'Consumes el token de recuperación (uso único, expiración configurable).',
  })
  @ApiBody({ schema: zodToSchema(resetPasswordSchema) })
  @ApiOkResponse({ schema: okSchema })
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
  @ApiSecurity('sessionCookie')
  @ApiOperation({
    summary: 'Cambiar contraseña propia',
    description: 'Requiere la contraseña actual. Revoca las demás sesiones del usuario.',
  })
  @ApiBody({ schema: zodToSchema(changePasswordSchema) })
  @ApiOkResponse({ schema: okSchema })
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
