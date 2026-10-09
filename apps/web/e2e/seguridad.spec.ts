import { expect, test } from '@playwright/test';
import {
  API_URL,
  UNAUTHENTICATED_COST,
  WEB_ORIGIN,
  archivePatientViaApi,
  createPatientViaApi,
  gotoApp,
  uniqueDni,
} from './helpers';

/**
 * Seguridad (SDD fase 10 / ADR-012): la app redirige sin sesión y la API
 * aplica las barreras en orden — Throttler → sesión → CSRF → permisos.
 * Los requests van al API absoluta (mismo host, sin Origin salvo el propio).
 */
test.describe('Seguridad', () => {
  test.describe('acceso sin sesión', () => {
    // Sin la sesión guardada: hay que simular a un navegador sin cookie.
    test.use({ storageState: { cookies: [], origins: [] } });

    test('una ruta protegida sin sesión redirige al login', async ({ page }) => {
      await gotoApp(page, '/auditoria/', UNAUTHENTICATED_COST);

      await expect(page).toHaveURL(/\/login/);
      await expect(
        page.getByRole('heading', { name: 'Sistema de Gestión Odontológica' }),
      ).toBeVisible();
      // El contenido privado jamás llega a renderizarse.
      await expect(page.getByRole('heading', { name: 'Auditoría' })).toHaveCount(0);
      await expect(page.getByRole('listitem').filter({ hasText: 'Ref ' })).toHaveCount(0);
    });
  });

  test('la API exige sesión y valida el Origin en los requests mutantes', async ({ page }) => {
    // 1) Con sesión (page.request comparte la cookie del navegador) pero con
    //    un Origin ajeno: lo rechaza el guard CSRF (4.ª barrera).
    const foreign = await page.request.post(`${API_URL}/patients`, {
      headers: { Origin: 'http://malicioso.example' },
      data: { firstName: 'CSRF', lastName: 'Rechazado', dni: uniqueDni() },
    });
    expect(foreign.status()).toBe(403);
    const foreignBody = (await foreign.json()) as { error?: { code?: string } };
    expect(foreignBody.error?.code).toBe('CSRF_ORIGIN_REJECTED');

    // 2) Control: con el Origin del web (permitido en WEB_ORIGIN) sí crea.
    //    Se archiva de inmediato para no dejar fichas huérfanas.
    const allowed = await createPatientViaApi(page, {
      firstName: 'CSRF',
      lastName: 'Permitido',
      headers: { Origin: WEB_ORIGIN },
    });
    await archivePatientViaApi(page, allowed.id);

    // 3) Sin sesión: se limpian las cookies del contexto para simular a un
    //    cliente ajeno (el fixture `request` comparte la sesión, por eso no
    //    sirve para este chequeo). La sesión va antes que el guard CSRF:
    //    sin cookie todo responde 401 (nunca 201 ni 403).
    await page.context().clearCookies();
    expect((await page.request.get(`${API_URL}/auth/me`)).status()).toBe(401);
    expect((await page.request.get(`${API_URL}/patients`)).status()).toBe(401);
    expect(
      (
        await page.request.post(`${API_URL}/patients`, {
          data: { firstName: 'Sin', lastName: 'Sesion', dni: uniqueDni() },
        })
      ).status(),
    ).toBe(401);
  });
});
