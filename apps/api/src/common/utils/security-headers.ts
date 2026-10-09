import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Headers de seguridad globales de la API (fase 12, ADR-017).
 *
 * Se aplican en `main.ts` (bootstrap real) y en el spec que los verifica,
 * igual que el patrón de `corsOptions`. Se usan tipos de `node:http` para no
 * acoplar el módulo a Express (el `res` de Express los extiende).
 *
 * - `X-Powered-By`: se elimina (no anunciar el framework).
 * - `X-Content-Type-Options: nosniff`: sin MIME-sniffing (fase 10).
 * - `X-Frame-Options: DENY`: la API nunca se embebe (clickjacking).
 * - `Referrer-Policy: no-referrer`: sin fugas de URL/origin.
 * - `Cache-Control: no-store`: datos médicos jamás en caches de navegador
 *   o proxies intermedios.
 *
 * CSP no se aplica al API: Swagger UI necesita scripts inline/CDN; el CSP
 * estricto va en el sitio estático (SDD §10).
 */
export function securityHeaders(
  _req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
}
