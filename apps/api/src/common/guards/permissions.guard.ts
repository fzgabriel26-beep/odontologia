import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../decorators/current-user.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';

/**
 * Guard de permisos (RBAC): valida los permisos declarados con
 * @RequirePermission contra los del usuario de la sesión.
 * Si la ruta no declara permisos, solo requiere estar autenticado.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!request.user) {
      // Ocurre solo si una ruta @Public() declara permisos (configuración inválida).
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Iniciá sesión para continuar.' },
      });
    }

    const missing = required.filter(
      (permission) => !request.user?.permissions.includes(permission),
    );
    if (missing.length > 0) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'No tenés permisos para realizar esta acción.' },
      });
    }
    return true;
  }
}
