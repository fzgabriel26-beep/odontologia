import { expect, test } from '@playwright/test';
import {
  MOUNT_COST,
  appointmentEntry,
  archivePatientViaApi,
  changeAppointmentStatusViaApi,
  createAppointmentViaApi,
  createPatientViaApi,
  expectNotice,
  gotoApp,
  listProfessionalsViaApi,
  reloadApp,
} from './helpers';

/**
 * Agenda (SDD fase 8 / CU-12 y CU-13): alta de turnos desde la UI, cambio
 * de estado con motivo (nunca borrado), y sincronización con cambios hechos
 * por API. Los pacientes creados para el test se archivan al final.
 */
test('la agenda crea y cancela turnos desde la UI y refleja los cambios de la API', async ({
  page,
}) => {
  const patientUi = await createPatientViaApi(page, { firstName: 'Agenda', lastName: 'Ui' });
  const patientApi = await createPatientViaApi(page, { firstName: 'Agenda', lastName: 'Api' });
  const professionals = await listProfessionalsViaApi(page);
  const professional = professionals[0];
  if (professional === undefined) throw new Error('No hay profesionales activos para agendar.');

  // Se crea ANTES de entrar a la agenda: debe verse en la primera carga.
  const apiAppointment = await createAppointmentViaApi(page, {
    patientId: patientApi.id,
    professionalId: professional.id,
    time: '16:30',
    reason: 'Turno creado por API (E2E)',
  });

  await gotoApp(page, '/agenda/', MOUNT_COST);
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();

  await test.step('crea un turno desde la UI', async () => {
    await page.getByRole('button', { name: 'Nuevo turno' }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Nuevo turno' });
    await expect(dialog.getByRole('heading', { name: 'Nuevo turno' })).toBeVisible();

    // Buscador con debounce: se elige al paciente por su DNI único.
    await page.locator('#appointment-patient-search').fill(patientUi.dni);
    await dialog
      .locator('button')
      .filter({ hasText: `DNI ${patientUi.dni}` })
      .click();
    // Al elegirlo, el picker se reemplaza por el resumen del paciente elegido.
    await expect(dialog.getByText(`DNI ${patientUi.dni}`)).toBeVisible();

    // El admin es el único profesional activo del seed.
    const professionalSelect = dialog.getByLabel('Profesional');
    await expect(professionalSelect.locator(`option[value="${professional.id}"]`)).toHaveCount(1);
    await professionalSelect.selectOption(professional.id);
    await dialog.getByLabel('Hora').fill('15:45');
    await dialog.getByLabel('Motivo').fill('Control E2E');
    await dialog.getByRole('button', { name: 'Crear turno' }).click();

    await expectNotice(page, 'Turno creado con estado "Pendiente".');

    const uiEntry = appointmentEntry(page, patientUi.dni);
    await expect(uiEntry.getByText('Motivo: Control E2E', { exact: true })).toBeVisible();
    await expect(uiEntry.getByText('Pendiente', { exact: true })).toBeVisible();
  });

  await test.step('el turno creado por API aparece en la agenda del día', async () => {
    const apiEntry = appointmentEntry(page, patientApi.dni);
    await expect(
      apiEntry.getByText('Motivo: Turno creado por API (E2E)', { exact: true }),
    ).toBeVisible();
    await expect(apiEntry.getByText('16:30', { exact: true })).toBeVisible();
    await expect(apiEntry.getByText('Pendiente', { exact: true })).toBeVisible();
  });

  await test.step('cancela un turno desde la UI con motivo', async () => {
    const uiEntry = appointmentEntry(page, patientUi.dni);
    await uiEntry.getByRole('button', { name: 'Estado' }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Cambiar estado' });
    await expect(dialog.getByRole('heading', { name: 'Cambiar estado' })).toBeVisible();
    await dialog.getByLabel('Nuevo estado').selectOption('CANCELADO');
    await dialog.getByLabel('Motivo').fill('Reprogramación (E2E)');
    await dialog.getByRole('button', { name: 'Cambiar estado' }).click();

    await expectNotice(page, 'Estado del turno actualizado. Quedó registrado en el historial.');
    await expect(uiEntry.getByText('Cancelado', { exact: true })).toBeVisible();
    await expect(
      uiEntry.locator('p').filter({ hasText: 'Cancelación: Reprogramación (E2E)' }),
    ).toBeVisible();
  });

  await test.step('un cambio de estado por API se refleja al recargar', async () => {
    await changeAppointmentStatusViaApi(
      page,
      apiAppointment.id,
      'CANCELADO',
      'Cambio por API (E2E)',
    );
    await reloadApp(page, MOUNT_COST);

    const apiEntry = appointmentEntry(page, patientApi.dni);
    await expect(apiEntry.getByText('Cancelado', { exact: true })).toBeVisible();
    await expect(
      apiEntry.locator('p').filter({ hasText: 'Cancelación: Cambio por API (E2E)' }),
    ).toBeVisible();
  });

  // Nunca se borran turnos ni fichas: se archivan (soft delete).
  await archivePatientViaApi(page, patientUi.id);
  await archivePatientViaApi(page, patientApi.id);
});
