import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { OdontogramService } from './odontogram.service';

/**
 * Tests de integración del odontograma (SDD, fase 6 / CU-09): 52 dientes FDI
 * ordenados, selección con estado, registro de eventos que actualizan el
 * estado actual, historial por diente con autor y observaciones. Requiere BD
 * migrada con seed (roles + admin).
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

async function expectApiError(promise: Promise<unknown>, code: string): Promise<void> {
  const caught = await promise.then(
    () => {
      throw new Error(`Se esperaba el error ${code} pero la operación resolvió correctamente.`);
    },
    (error: unknown) => error,
  );
  expect(caught).toBeInstanceOf(HttpException);
  const body = (caught as HttpException).getResponse() as { error?: { code?: string } };
  expect(body.error?.code).toBe(code);
}

/** Fecha local de hoy en aaaa-mm-dd (misma lógica que usa el servicio). */
function localTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

let testModule: TestingModule;
const createdPatientIds: string[] = [];

async function adminActor(): Promise<{ id: string; ip: string }> {
  const prisma = testModule.get(PrismaService);
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local';
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  return { id: admin.id, ip: '127.0.0.1' };
}

/** Crea un paciente de prueba (con sus 52 dientes) y registra el id. */
async function createTestPatient(offset: number): Promise<string> {
  // Por el servicio (no prisma directo): es quien crea los 52 dientes en transacción.
  const patientsService = testModule.get(PatientsService);
  const actor = await adminActor();
  const patient = await patientsService.create(
    {
      firstName: 'Odonto',
      lastName: `Test${offset}`,
      dni: String((Date.now() % 10_000_000) + offset),
    },
    actor,
  );
  createdPatientIds.push(patient.id);
  return patient.id;
}

/** Devuelve el diente FDI de un paciente de prueba. */
async function toothOf(patientId: string, fdiNumber: number): Promise<{ id: string }> {
  const prisma = testModule.get(PrismaService);
  return prisma.tooth.findUniqueOrThrow({
    where: { patientId_fdiNumber: { patientId, fdiNumber } },
    select: { id: true },
  });
}

describe('OdontogramService (fase 6 — odontograma)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL no está definida (revisá .env en la raíz).');
    }
    const { AppModule } = await import('../app.module');
    testModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await testModule.init();
  });

  afterAll(async () => {
    const prisma = testModule.get(PrismaService);
    // Limpieza robusta por paciente (no por ids trackeados): un test fallido
    // no deja huérfanos que bloqueen el borrado por FK Restrict.
    const teeth = await prisma.tooth.findMany({
      where: { patientId: { in: createdPatientIds } },
      select: { id: true },
    });
    const toothIds = teeth.map((tooth) => tooth.id);
    const events = await prisma.toothEvent.findMany({
      where: { toothId: { in: toothIds } },
      select: { id: true },
    });
    const eventIds = events.map((event) => event.id);
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityType: 'TOOTH_EVENT', entityId: { in: eventIds } },
          { entityType: 'TOOTH', entityId: { in: toothIds } },
          { entityType: 'PATIENT', entityId: { in: createdPatientIds } },
        ],
      },
    });
    await prisma.toothEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.tooth.deleteMany({ where: { patientId: { in: createdPatientIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
    await testModule.close();
  });

  it('lista los 52 dientes FDI del paciente ordenados y todos sanos al inicio', async () => {
    const service = testModule.get(OdontogramService);
    const patientId = await createTestPatient(200);

    const teeth = await service.listTeeth(patientId);
    expect(teeth).toHaveLength(52);
    // Orden numérico FDI de menor a mayor (11..48 / 51..85).
    const numbers = teeth.map((tooth) => tooth.fdiNumber);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(numbers[0]).toBe(11);
    expect(teeth.filter((tooth) => tooth.type === 'PERMANENTE')).toHaveLength(32);
    expect(teeth.filter((tooth) => tooth.type === 'TEMPORAL')).toHaveLength(20);
    expect(teeth.every((tooth) => tooth.currentStatus === 'SANO')).toBe(true);
    expect(teeth.every((tooth) => tooth.observations === null)).toBe(true);
  });

  it('devuelve 404 para un paciente inexistente', async () => {
    const service = testModule.get(OdontogramService);
    await expectApiError(
      service.listTeeth('a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10'),
      'PATIENT_NOT_FOUND',
    );
  });

  it('registra un evento con autor y actualiza el estado actual del diente', async () => {
    const service = testModule.get(OdontogramService);
    const actor = await adminActor();
    const patientId = await createTestPatient(201);
    const tooth = await toothOf(patientId, 36);

    const event = await service.createEvent(
      tooth.id,
      { status: 'CARIES', note: 'Caries en oclusal', eventDate: '2026-10-01' },
      actor,
    );
    expect(event.status).toBe('CARIES');
    expect(event.note).toBe('Caries en oclusal');
    expect(event.eventDate.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(event.createdBy.id).toBe(actor.id);

    // El estado actual del diente cambia en la misma transacción.
    const teeth = await service.listTeeth(patientId);
    const updated = teeth.find((item) => item.id === tooth.id);
    expect(updated?.currentStatus).toBe('CARIES');

    // Auditoría: evento creado + odontograma actualizado (sin la nota libre).
    const prisma = testModule.get(PrismaService);
    const eventAudit = await prisma.auditLog.findFirst({
      where: { action: 'TOOTH_EVENT_CREATED', entityId: event.id },
    });
    expect(eventAudit).not.toBeNull();
    expect((eventAudit?.metadata as Record<string, unknown>)?.note).toBeUndefined();
    const odontoAudit = await prisma.auditLog.findFirst({
      where: { action: 'ODONTOGRAM_UPDATED', entityId: tooth.id },
    });
    expect(odontoAudit).not.toBeNull();
  });

  it('usa la fecha actual cuando el evento no trae fecha', async () => {
    const service = testModule.get(OdontogramService);
    const actor = await adminActor();
    const patientId = await createTestPatient(202);
    const tooth = await toothOf(patientId, 11);

    const event = await service.createEvent(tooth.id, { status: 'RESTAURACION' }, actor);
    expect(event.eventDate.toISOString().slice(0, 10)).toBe(localTodayIso());
    expect(event.note).toBeNull();
  });

  it('devuelve 404 para un diente inexistente', async () => {
    const service = testModule.get(OdontogramService);
    const missing = 'a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10';
    await expectApiError(service.listEvents(missing), 'TOOTH_NOT_FOUND');
    await expectApiError(
      service.createEvent(missing, { status: 'SANO' }, await adminActor()),
      'TOOTH_NOT_FOUND',
    );
    await expectApiError(
      service.updateTooth(missing, { observations: 'x' }, await adminActor()),
      'TOOTH_NOT_FOUND',
    );
  });

  it('consulta el historial por diente de recientes a viejas, con autor y aislado', async () => {
    const service = testModule.get(OdontogramService);
    const actor = await adminActor();
    const patientId = await createTestPatient(203);
    const toothA = await toothOf(patientId, 26);
    const toothB = await toothOf(patientId, 46);

    const older = await service.createEvent(
      toothA.id,
      { status: 'ENDODONCIA', eventDate: '2026-09-10' },
      actor,
    );
    const newer = await service.createEvent(
      toothA.id,
      { status: 'CORONA', eventDate: '2026-10-08' },
      actor,
    );
    await service.createEvent(toothB.id, { status: 'FRACTURA', eventDate: '2026-10-05' }, actor);

    const history = await service.listEvents(toothA.id);
    expect(history).toHaveLength(2);
    expect(history[0]?.id).toBe(newer.id);
    expect(history[1]?.id).toBe(older.id);
    expect(history[0]?.createdBy.lastName).toBeTruthy();
    expect(history[0]?.createdBy.id).toBe(actor.id);

    // El historial de otro diente no se mezcla.
    const otherHistory = await service.listEvents(toothB.id);
    expect(otherHistory).toHaveLength(1);
    expect(otherHistory[0]?.id).not.toBe(newer.id);
  });

  it('edita observaciones del diente con auditoría y valida que haya datos', async () => {
    const service = testModule.get(OdontogramService);
    const actor = await adminActor();
    const patientId = await createTestPatient(204);
    const tooth = await toothOf(patientId, 47);

    const updated = await service.updateTooth(
      tooth.id,
      { observations: 'Corona de porcelana colocada en 2024' },
      actor,
    );
    expect(updated.observations).toBe('Corona de porcelana colocada en 2024');
    expect(updated.currentStatus).toBe('SANO'); // el estado solo cambia vía evento

    // Limpiar con '' persiste null.
    const cleared = await service.updateTooth(tooth.id, { observations: '' }, actor);
    expect(cleared.observations).toBeNull();

    const prisma = testModule.get(PrismaService);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ODONTOGRAM_UPDATED', entityId: tooth.id },
    });
    expect(audit).not.toBeNull();

    await expectApiError(service.updateTooth(tooth.id, {}, actor), 'NOTHING_TO_UPDATE');
  });
});
