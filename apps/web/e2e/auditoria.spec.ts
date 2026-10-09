import { expect, test } from '@playwright/test';
import { MOUNT_COST, archivePatientViaApi, createPatientViaApi, gotoApp } from './helpers';

/**
 * Auditoría (SDD CU-15 / fase 9): registro inmutable e imborrable. El alta
 * hecha por API en este test deja una fila `PATIENT_CREATED` con
 * `entityId = patient.id`, lo que permite localizarla sin depender de fechas.
 */
test('consulta la auditoría con filtros por acción y por fechas', async ({ page }) => {
  const patient = await createPatientViaApi(page, { firstName: 'Auditoría', lastName: 'E2E' });
  const refText = `Ref ${patient.id.slice(0, 8)}`;

  await gotoApp(page, '/auditoria/', MOUNT_COST);
  await expect(page.getByRole('heading', { name: 'Auditoría' })).toBeVisible();

  // 1. Lista completa: el alta recién hecha está registrada (orden descendente).
  await expect(page.getByRole('listitem').filter({ hasText: refText }).first()).toBeVisible();

  // 2. Filtro por acción: solo altas de pacientes; ningún inicio de sesión.
  await page.getByLabel('Acción').selectOption('PATIENT_CREATED');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: refText }).first()).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Inicio de sesión' })).toHaveCount(0);

  // 3. Cambio de filtro: los inicios de sesión del login del setup aparecen.
  await page.getByLabel('Acción').selectOption('LOGIN');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Inicio de sesión' }).first(),
  ).toBeVisible();

  // 4. Rango de fechas futuro: estado vacío determinista (el registro es inmutable).
  await page.getByLabel('Acción').selectOption('');
  await page.getByLabel('Desde').fill('2099-01-01');
  await page.getByLabel('Hasta').fill('2099-12-31');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(
    page.getByText('Sin registros para los filtros indicados.', { exact: true }),
  ).toBeVisible();

  // 5. El archivado también audita y "Limpiar" restaura la vista completa.
  await archivePatientViaApi(page, patient.id);
  await page.getByRole('button', { name: 'Limpiar' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: refText }).first()).toBeVisible();
});
