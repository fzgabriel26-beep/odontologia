import { expect, test } from '@playwright/test';
import {
  MOUNT_COST,
  archivePatientViaApi,
  createPatientViaApi,
  expectNotice,
  gotoApp,
  readDownload,
} from './helpers';

/**
 * Ficha del paciente (SDD fase 5 y 6): historia clínica (evolución con
 * autor), odontograma FDI con eventos por diente y exportación del PDF.
 * La ficha se archiva al final (soft delete, historial intacto).
 */
test('la ficha registra una evolución, actualiza el odontograma y exporta el PDF', async ({
  page,
}) => {
  const patient = await createPatientViaApi(page, { firstName: 'Ficha', lastName: 'E2E' });

  await gotoApp(page, `/pacientes/ficha/?id=${patient.id}`, MOUNT_COST);
  await expect(page.getByRole('heading', { name: 'E2E, Ficha' })).toBeVisible();
  await expect(page.getByText(`DNI ${patient.dni}`, { exact: true })).toBeVisible();

  await test.step('registra una evolución en la historia clínica', async () => {
    await page.getByRole('tab', { name: 'Historia clínica' }).click();
    await expect(
      page.locator('p').filter({ hasText: 'Todavía no hay evoluciones registradas.' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Nueva evolución' }).click();
    await page.getByLabel('Motivo').fill('Control de dolor E2E');
    await page.getByLabel('Dientes (FDI)').fill('11');
    await page.getByRole('button', { name: 'Registrar evolución' }).click();

    await expectNotice(page, 'Evolución registrada correctamente.');
    await expect(page.getByText('Control de dolor E2E', { exact: true })).toBeVisible();
    await expect(page.getByText('Por Inicial, Administrador', { exact: true })).toBeVisible();
  });

  await test.step('registra un evento dental en el odontograma', async () => {
    await page.getByRole('tab', { name: 'Odontograma' }).click();
    const tooth11 = page.locator('[aria-label^="Diente 11:"]');
    await expect(tooth11).toBeVisible();
    await tooth11.click();

    await page.getByLabel('Estado').selectOption('CARIES');
    await page.getByLabel('Nota (opcional)').fill('Caries oclusal (E2E)');
    await page.getByRole('button', { name: 'Registrar evento' }).click();

    await expectNotice(page, 'Evento registrado: el estado del diente se actualizó.');
    // El estado visible del diente refleja el evento recién registrado.
    await expect(page.locator('[aria-label="Diente 11: Caries"]')).toBeVisible();
    await expect(page.locator('p').filter({ hasText: 'Caries oclusal (E2E)' })).toBeVisible();
    await expect(page.getByText('Por Inicial, Administrador', { exact: true })).toBeVisible();
  });

  await test.step('exporta el odontograma como PDF', async () => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar PDF' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    const bytes = await readDownload(download);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    await expectNotice(page, 'PDF del odontograma generado y descargado.');
  });

  await archivePatientViaApi(page, patient.id);
});
