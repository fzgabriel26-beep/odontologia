import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SESSION_COOKIE, readCookie } from '../utils/cookie';
import { SessionsService } from '../../auth/sessions.service';

type RequestWithCookies = {
  headers: { cookie?: string };
  user?: AuthUser;
};

/**
 * Guard global de sesión (ADR-001): valida la cookie opaca contra la base.
 * Toda ruta sin @Public() exige sesión vigente y usuario activo.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithCookies>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);

    if (!token) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Iniciá sesión para continuar.' },
      });
    }

    const session = await this.sessions.validate(token);
    if (!session) {
      throw new UnauthorizedException({
        error: { code: 'SESSION_EXPIRED', message: 'Tu sesión expiró. Iniciá sesión nuevamente.' },
      });
    }

    request.user = session.user;
    return true;
  }
}
