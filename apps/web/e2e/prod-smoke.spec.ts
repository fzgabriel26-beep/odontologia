import { expect, test } from '@playwright/test';

const PROD_URL = process.env.E2E_PROD_URL ?? '';

/**
 * Smoke del deploy público (fase 12 / ADR-017): solo corre si `E2E_PROD_URL`
 * está definida (lo indica playwright.config.ts). Verifica el HTML servido
 * por el export estático y los headers de seguridad documentados en el ADR
 * (nosniff, referrer-policy, CSP con `frame-ancestors 'none'`).
 */
test.describe('Smoke del deploy público', () => {
  test('la landing responde con los headers de seguridad del ADR-017', async ({ request }) => {
    test.skip(PROD_URL === '', 'Sin E2E_PROD_URL no hay deploy público que validar.');

    const response = await request.get(PROD_URL);
    expect(response.status()).toBe(200);

    const headers = response.headers();
    expect(headers['content-type'] ?? '').toContain('text/html');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy'] ?? '').not.toBe('');

    const csp = headers['content-security-policy'] ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    // Vista previa in-app de estudios (blob del proxy autenticado).
    expect(csp).toContain('frame-src blob:');

    const html = await response.text();
    expect(html).toContain('Sistema de Gestión Odontológica');
  });

  test('las rutas estáticas del export responden', async ({ request }) => {
    test.skip(PROD_URL === '', 'Sin E2E_PROD_URL no hay deploy público que validar.');

    const login = await request.get(new URL('/login/', PROD_URL).toString());
    expect(login.status()).toBe(200);
    expect(login.headers()['content-type'] ?? '').toContain('text/html');
    expect(await login.text()).toContain('Sistema de Gestión Odontológica');
  });
});
