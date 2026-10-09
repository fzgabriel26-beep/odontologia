import { expect, test as setup } from '@playwright/test';
import { ADMIN_EMAIL, LOGIN_COST, STORAGE_STATE, gotoApp, loginViaUi } from './helpers';

/**
 * Proyecto `setup` de playwright.config.ts: loguea UNA vez y guarda la
 * sesión en `.auth/admin.json` para el resto de las specs (así solo este
 * test gasta el rate limit de `/auth/login` y ninguna spec depende de otro
 * test para tener sesión).
 */
setup('loguea al administrador y guarda la sesión', async ({ page }) => {
  await gotoApp(page, '/login/', LOGIN_COST);
  await loginViaUi(page);

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Navegación principal', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pacientes', exact: true })).toBeVisible();
  await expect(page.locator('aside').getByText(ADMIN_EMAIL, { exact: true })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
