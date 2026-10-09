/**
 * Orígenes de frontend permitidos (ADR-015).
 *
 * `WEB_ORIGIN` admite una lista separada por coma. El primer valor es el
 * origen principal del frontend web (el que se usa, p. ej., para los enlaces
 * de recuperación de contraseña). El bundle de escritorio Tauri se sirve
 * desde `http://tauri.localhost` y también debe figurar en la lista.
 */
export function webOrigins(): string[] {
  const raw = process.env.WEB_ORIGIN ?? 'http://localhost:3000,http://tauri.localhost';
  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, '').toLowerCase())
    .filter((origin) => origin.length > 0);
}

/** Origen principal: el frontend web (primero de la lista). */
export function primaryWebOrigin(): string {
  return webOrigins()[0] ?? 'http://localhost:3000';
}

/**
 * Indica si un Origin corresponde a la app de escritorio (webview de Tauri).
 *
 * En Windows la webview se sirve desde `http://tauri.localhost` (custom
 * protocol de WebView2); en macOS/Linux sería `tauri://localhost`. Ese origen
 * es *cross-site* con `localhost` (se verificó empíricamente, fase 11), por lo
 * que la cookie de sesión requiere SameSite=None (ADR-015).
 */
export function isDesktopOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  const normalized = origin.replace(/\/+$/, '').toLowerCase();
  return (
    normalized.startsWith('tauri://') ||
    normalized === 'http://tauri.localhost' ||
    normalized.endsWith('.tauri.localhost')
  );
}

/**
 * Opciones de CORS compartidas entre el bootstrap (`main.ts`) y los tests
 * HTTP, para que ambos usen exactamente la misma configuración.
 */
export function corsOptions(): {
  origin: string[];
  credentials: boolean;
  exposedHeaders: string[];
} {
  return {
    origin: webOrigins(),
    credentials: true,
    // Para que el front pueda leer el nombre del archivo (PDF del odontograma).
    exposedHeaders: ['Content-Disposition'],
  };
}
