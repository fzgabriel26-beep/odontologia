import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function normalizeOrigin(value: string): string {
  return value.replace(/\/$/, '').toLowerCase();
}

/**
 * Protección CSRF del lado del servidor (ADR-012), sin intervención del frontend:
 *
 * 1. Las cookies de sesión son SameSite=Lax, por lo que un sitio de terceros
 *    no puede enviarlas en requests mutantes.
 * 2. Como refuerzo, se valida la cabecera Origin en todo request mutante:
 *    solo se acepta el origen del frontend (WEB_ORIGIN), orígenes extra
 *    configurados (CSRF_ORIGINS) o el mismo host de la API.
 * 3. Requests sin Origin (clientes no-browser: curl, tests, Swagger CLI)
 *    no están sujetos a esta validación.
 */
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method: string;
      headers: { origin?: string; host?: string };
    }>();

    if (!MUTATING_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    if (!origin) return true;

    const allowed = new Set<string>();
    if (process.env.WEB_ORIGIN) allowed.add(normalizeOrigin(process.env.WEB_ORIGIN));
    for (const extra of (process.env.CSRF_ORIGINS ?? '').split(',')) {
      if (extra.trim()) allowed.add(normalizeOrigin(extra.trim()));
    }
    if (request.headers.host) {
      allowed.add(`http://${request.headers.host.toLowerCase()}`);
      allowed.add(`https://${request.headers.host.toLowerCase()}`);
    }

    if (!allowed.has(normalizeOrigin(origin))) {
      throw new ForbiddenException({
        error: {
          code: 'CSRF_ORIGIN_REJECTED',
          message: 'La solicitud no proviene de un origen permitido.',
        },
      });
    }
    return true;
  }
}
