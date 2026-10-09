import { expect, test } from '@playwright/test';
import {
  ADMIN_EMAIL,
  FAILED_LOGIN_COST,
  LOGIN_COST,
  MOUNT_COST,
  expectNotice,
  gotoApp,
  loginViaUi,
} from './helpers';

/**
 * Autenticación por formulario (SDD fase 2): acceso válido, rechazo con
 * mensaje en español y reutilización de la sesión guardada por el setup.
 */
test.describe('Autenticación', () => {
  test.describe('formulario de acceso', () => {
    // Sin sesión: con la guardada, el login redirigiría al dashboard.
    test.use({ storageState: { cookies: [], origins: [] } });

    test('con credenciales válidas ingresa al dashboard', async ({ page }) => {
      await gotoApp(page, '/login/', LOGIN_COST);

      await expect(
        page.getByRole('heading', { name: 'Sistema de Gestión Odontológica' }),
      ).toBeVisible();
      await loginViaUi(page);

      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Agenda', exact: true })).toBeVisible();
      await expect(page.locator('aside').getByText(ADMIN_EMAIL, { exact: true })).toBeVisible();
    });

    test('con credenciales inválidas muestra el error del backend', async ({ page }) => {
      await gotoApp(page, '/login/', FAILED_LOGIN_COST);

      await page.getByLabel('Email').fill(ADMIN_EMAIL);
      await page.getByLabel('Contraseña').fill('Clave-incorrecta-123');
      await page.getByRole('button', { name: 'Ingresar' }).click();

      await expectNotice(page, 'Email o contraseña incorrectos.');
      // Sigue en el login (sin sesión y sin fuga hacia pantallas privadas).
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByLabel('Email')).toHaveValue(ADMIN_EMAIL);
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0);
    });
  });

  test('la sesión guardada reutiliza el acceso sin volver a loguear', async ({ page }) => {
    await gotoApp(page, '/dashboard/', MOUNT_COST);

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('aside').getByText(ADMIN_EMAIL, { exact: true })).toBeVisible();
    // No reaparece el formulario de login.
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
