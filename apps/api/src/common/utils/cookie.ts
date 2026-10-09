import { isDesktopOrigin } from './origins';

/** Cookie de sesión (httpOnly). El frontend nunca puede leerla. */
export const SESSION_COOKIE = 'odon_session';

export interface CookieOptions {
  httpOnly?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
  path?: string;
  expires?: Date;
}

/** Respuesta mínima necesaria para setear cookies (evita atar el código a express). */
export interface CookieResponse {
  cookie(name: string, value: string, options: CookieOptions): unknown;
  clearCookie(name: string, options?: CookieOptions): unknown;
}

export interface SessionCookieContext {
  /** Cabecera `Origin` de la petición (ausente en clientes no navegador). */
  origin?: string;
}

/**
 * Atributos de la cookie de sesión según el origen que hizo el login:
 *
 * - Web (`localhost:3000`): `SameSite=Lax` — primer pilar del control CSRF
 *   (ADR-012); el refuerzo es el `CsrfOriginGuard`.
 * - Escritorio Tauri (`tauri.localhost`): origen cross-site con `localhost`,
 *   así que `SameSite=Lax` impediría enviar la cookie. Se usa
 *   `SameSite=None; Secure` (ADR-015). `Secure` es válido sobre
 *   `http://localhost` (origen confiable del navegador).
 * - Despliegue (ADR-016): cuando el web y el API viven en dominios distintos
 *   (p. ej. `*.onrender.com` sitio + `*.onrender.com` API con la Public
 *   Suffix List, o dominios distintos), el web también es cross-site con la
 *   API: `SESSION_COOKIE_SAMESITE=none` fuerza `SameSite=None; Secure` para
 *   cualquier origen (requiere HTTPS, que los proveedores de hosting proveen).
 */
function sessionCookieAttributes(context: SessionCookieContext): {
  sameSite: 'lax' | 'none';
  secure: boolean;
} {
  if (isDesktopOrigin(context.origin) || process.env.SESSION_COOKIE_SAMESITE === 'none') {
    return { sameSite: 'none', secure: true };
  }
  return { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' };
}

export function setSessionCookie(
  res: CookieResponse,
  token: string,
  expiresAt: Date,
  context: SessionCookieContext = {},
): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    ...sessionCookieAttributes(context),
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: CookieResponse, context: SessionCookieContext = {}): void {
  // Se repiten los atributos para borrar exactamente la variante que
  // quedó guardada en el jar del navegador (web o escritorio).
  res.clearCookie(SESSION_COOKIE, {
    ...sessionCookieAttributes(context),
    path: '/',
  });
}

/** Lee una cookie del header `Cookie` sin depender de middleware externo. */
export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}
