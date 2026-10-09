import { expect, test } from '@playwright/test';
import {
  MOUNT_COST,
  PNG_FIXTURE,
  archivePatientViaApi,
  createPatientViaApi,
  expectNotice,
  fileEntry,
  gotoApp,
  readDownload,
} from './helpers';

/**
 * Archivos médicos (SDD fase 7 / CU-10): subida con validación de magic
 * bytes, listado con tamaño/tipo, vista previa in-app por proxy
 * autenticado (blob, sin pestañas nuevas), descarga y archivado sin
 * borrado físico del binario.
 */
test('sube, lista, visualiza, descarga y archiva un estudio del paciente', async ({ page }) => {
  const patient = await createPatientViaApi(page, { firstName: 'Archivo', lastName: 'E2E' });

  await gotoApp(page, `/pacientes/ficha/?id=${patient.id}`, MOUNT_COST);
  await page.getByRole('tab', { name: 'Estudios y archivos' }).click();
  await expect(
    page.locator('p').filter({ hasText: 'Todavía no hay archivos cargados.' }),
  ).toBeVisible();

  await test.step('sube un PNG con firma válida', async () => {
    // Primer clic: el botón de la cabecera abre el formulario (inline).
    await page.getByRole('button', { name: 'Subir archivo' }).click();
    await page.locator('#file-upload').setInputFiles(PNG_FIXTURE);
    await page.getByLabel('Descripción (opcional)').fill('Radiografía de control (E2E)');
    // Segundo clic: el submit del formulario (el de la cabecera ya no existe).
    await page.locator('form').getByRole('button', { name: 'Subir archivo' }).click();

    await expectNotice(page, 'Archivo subido correctamente.');
    const entry = fileEntry(page, 'estudio-e2e.png');
    await expect(entry.getByText('estudio-e2e.png', { exact: true })).toBeVisible();
    await expect(entry.locator('p').filter({ hasText: '68 B · image/png' })).toBeVisible();
    await expect(entry.getByText('Radiografía de control (E2E)', { exact: true })).toBeVisible();
  });

  await test.step('visualiza el estudio en el diálogo (proxy con sesión)', async () => {
    await fileEntry(page, 'estudio-e2e.png').getByRole('button', { name: 'Ver' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('image/png');

    // El <img> apunta a un blob: descargado con la cookie de sesión.
    const preview = dialog.locator('img');
    await expect(preview).toBeVisible();
    await expect
      .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);

    await dialog.getByRole('button', { name: 'Cerrar' }).click();
    await expect(dialog).toHaveCount(0);
  });

  await test.step('descarga el estudio y verifica los magic bytes PNG', async () => {
    const downloadPromise = page.waitForEvent('download');
    await fileEntry(page, 'estudio-e2e.png').getByRole('link', { name: 'Descargar' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('estudio-e2e.png');
    const bytes = await readDownload(download);
    expect(bytes.subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  await test.step('archiva el estudio sin borrar el binario', async () => {
    await fileEntry(page, 'estudio-e2e.png').getByRole('button', { name: 'Archivar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archivar', exact: true }).click();

    await expectNotice(page, 'Archivo archivado (el binario se conserva; nunca se borra).');
    await expect(page.getByText('estudio-e2e.png', { exact: true })).toHaveCount(0);
    await expect(
      page.locator('p').filter({ hasText: 'Todavía no hay archivos cargados.' }),
    ).toBeVisible();
  });

  await archivePatientViaApi(page, patient.id);
});
