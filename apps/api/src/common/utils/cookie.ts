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

export function setSessionCookie(res: CookieResponse, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    // Control CSRF del lado del servidor (ADR-012): SameSite=Lax impide que
    // sitios de terceros envíen requests mutantes con la cookie adjunta.
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: CookieResponse): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
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
