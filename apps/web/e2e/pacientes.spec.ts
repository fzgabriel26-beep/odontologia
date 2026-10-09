import { expect, test } from '@playwright/test';
import {
  MOUNT_COST,
  archivePatientViaApi,
  createPatientViaApi,
  expectNotice,
  gotoApp,
  uniqueDni,
} from './helpers';

/**
 * Pacientes (SDD fase 4 / CU-06 y CU-07): alta, búsqueda en servidor,
 * archivado lógico (nunca borrado físico) y rechazo de DNI duplicado.
 */
test.describe('Pacientes', () => {
  test('da de alta un paciente con DNI único, lo busca y lo archiva', async ({ page }) => {
    const dni = uniqueDni();

    await gotoApp(page, '/pacientes/', MOUNT_COST);
    await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible();

    // Alta desde el formulario con todos los campos obligatorios.
    await page.getByRole('button', { name: 'Nuevo paciente' }).click();
    await page.getByLabel('Nombre').fill('E2E');
    await page.getByLabel('Apellido').fill('Alta');
    await page.getByLabel('DNI', { exact: true }).fill(dni);
    await page.getByLabel('Fecha de nacimiento').fill('1991-03-21');
    await page.getByRole('button', { name: 'Crear paciente' }).click();
    await expectNotice(page, 'Ficha de Alta, E2E creada correctamente.');

    // Búsqueda en servidor (debounce 300 ms) por el DNI recién creado.
    await page.getByLabel('Buscar pacientes').fill(dni);
    await expect(page.getByRole('cell', { name: dni, exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Alta, E2E', exact: true })).toBeVisible();

    // Archivar: la ficha no se borra, solo cambia de estado.
    const row = page.locator('tr').filter({ hasText: dni });
    await row.getByRole('button', { name: 'Archivar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archivar', exact: true }).click();
    await expectNotice(page, 'La ficha de Alta, E2E fue archivada (se conserva el historial).');

    // Con el filtro "Activos" activo, el paciente archivado ya no aparece.
    await expect(page.getByRole('cell', { name: dni, exact: true })).toHaveCount(0);
    await expect(
      page.getByText('Ningún paciente coincide con la búsqueda o el filtro.', { exact: true }),
    ).toBeVisible();
  });

  test('rechaza un DNI duplicado con el mensaje del backend', async ({ page }) => {
    const existing = await createPatientViaApi(page, {
      firstName: 'Duplicado',
      lastName: 'E2E',
    });

    await gotoApp(page, '/pacientes/', MOUNT_COST);
    await page.getByRole('button', { name: 'Nuevo paciente' }).click();
    await page.getByLabel('Nombre').fill('Otro');
    await page.getByLabel('Apellido').fill('Paciente');
    await page.getByLabel('DNI', { exact: true }).fill(existing.dni);
    await page.getByRole('button', { name: 'Crear paciente' }).click();

    await expectNotice(page, 'Ya existe un paciente con ese DNI.');
    // El formulario sigue abierto y la ficha original no se tocó.
    await expect(page.getByLabel('DNI', { exact: true })).toHaveValue(existing.dni);
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByLabel('DNI', { exact: true })).toHaveCount(0);

    await archivePatientViaApi(page, existing.id);
  });
});
