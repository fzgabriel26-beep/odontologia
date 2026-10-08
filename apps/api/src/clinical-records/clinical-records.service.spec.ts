import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicalRecordsService } from './clinical-records.service';

/**
 * Tests de integración de historia clínica (SDD, fase 5 / CU-08):
 * crear, consultar con autor visible, orden, archivado sin borrado físico
 * y auditoría. Requiere BD migrada con seed (roles + admin).
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

let testModule: TestingModule;
const createdPatientIds: string[] = [];
const createdRecordIds: string[] = [];

async function adminActor(): Promise<{ id: string; ip: string }> {
  const prisma = testModule.get(PrismaService);
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local';
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  return { id: admin.id, ip: '127.0.0.1' };
}

/** Crea un paciente de prueba y registra sus ids para la limpieza. */
async function createTestPatient(offset: number): Promise<string> {
  const prisma = testModule.get(PrismaService);
  const actor = await adminActor();
  const patient = await prisma.patient.create({
    data: {
      firstName: 'Historia',
      lastName: `Clinica${offset}`,
      dni: String((Date.now() % 10_000_000) + offset),
      status: 'ACTIVO',
      createdById: actor.id,
    },
  });
  createdPatientIds.push(patient.id);
  return patient.id;
}

describe('ClinicalRecordsService (fase 5 — historia clínica)', () => {
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
    // Limpieza robusta: busca los registros por paciente (no por ids trackeados),
    // para que un test fallido no deje huérfanos que bloqueen el borrado.
    const records = await prisma.clinicalRecord.findMany({
      where: { patientId: { in: createdPatientIds } },
      select: { id: true },
    });
    const recordIds = records.map((record) => record.id);
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityType: 'CLINICAL_RECORD', entityId: { in: recordIds } },
          { entityType: 'PATIENT', entityId: { in: createdPatientIds } },
        ],
      },
    });
    await prisma.clinicalRecord.deleteMany({ where: { id: { in: recordIds } } });
    await prisma.tooth.deleteMany({ where: { patientId: { in: createdPatientIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
    await testModule.close();
  });

  it('crea una evolución con autor, dientes FDI y auditoría', async () => {
    const service = testModule.get(ClinicalRecordsService);
    const actor = await adminActor();
    const patientId = await createTestPatient(100);

    const created = await service.create(
      patientId,
      {
        date: '2026-10-08',
        time: '10:30',
        reason: 'Dolor en molar inferior',
        diagnosis: 'Pulpitis reversible',
        treatment: 'Endodoncia',
        observations: 'Se indicó control',
        indications: 'Evitar masticar del lado afectado',
        toothNumbers: [36],
      },
      actor,
    );
    createdRecordIds.push(created.id);

    expect(created.patientId).toBe(patientId);
    expect(created.time).toBe('10:30');
    expect(created.toothNumbers).toEqual([36]);
    expect(created.archivedAt).toBeNull();
    // Autor visible (test obligatorio: "autor").
    expect(created.createdBy.id).toBe(actor.id);
    const admin = await testModule
      .get(PrismaService)
      .user.findUniqueOrThrow({ where: { id: actor.id } });
    expect(created.createdBy.firstName).toBe(admin.firstName);
    expect(created.createdBy.lastName).toBe(admin.lastName);

    const prisma = testModule.get(PrismaService);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'CLINICAL_RECORD_CREATED', entityId: created.id },
    });
    expect(audit).not.toBeNull();
    // La auditoría no guarda contenido clínico sensible (SDD §7).
    const metadata = audit?.metadata as Record<string, unknown> | null;
    expect(metadata?.reason).toBeUndefined();
    expect(metadata?.diagnosis).toBeUndefined();
  });

  it('consulta las evoluciones del paciente ordenadas de recientes a viejas', async () => {
    const service = testModule.get(ClinicalRecordsService);
    const actor = await adminActor();
    const patientId = await createTestPatient(101);

    const older = await service.create(
      patientId,
      { date: '2026-09-01', time: '09:00', reason: 'Primera consulta' },
      actor,
    );
    const newer = await service.create(
      patientId,
      { date: '2026-10-08', time: '15:00', reason: 'Control' },
      actor,
    );
    createdRecordIds.push(older.id, newer.id);

    const list = await service.list(patientId);
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe(newer.id);
    expect(list[1]?.id).toBe(older.id);
    expect(list[0]?.createdBy.lastName).toBeTruthy();

    // Solo las evoluciones de este paciente.
    const otherPatientId = await createTestPatient(102);
    const otherList = await service.list(otherPatientId);
    expect(otherList).toHaveLength(0);
  });

  it('devuelve 404 para un paciente inexistente al listar y al crear', async () => {
    const service = testModule.get(ClinicalRecordsService);
    const actor = await adminActor();
    const missing = 'a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10';

    await expectApiError(service.list(missing), 'PATIENT_NOT_FOUND');
    await expectApiError(
      service.create(missing, { date: '2026-10-08', time: '10:00', reason: 'x' }, actor),
      'PATIENT_NOT_FOUND',
    );
  });

  it('archiva una evolución sin borrarla: queda en base y sale del listado', async () => {
    const service = testModule.get(ClinicalRecordsService);
    const actor = await adminActor();
    const patientId = await createTestPatient(103);

    const record = await service.create(
      patientId,
      { date: '2026-10-08', time: '11:00', reason: 'Registro a archivar' },
      actor,
    );
    createdRecordIds.push(record.id);

    const archived = await service.archive(patientId, record.id, actor);
    expect(archived.archivedAt).not.toBeNull();

    // Ya no aparece en la evolución activa...
    const list = await service.list(patientId);
    expect(list.some((item) => item.id === record.id)).toBe(false);

    // ...pero sigue existiendo en la base (nunca se borra físicamente).
    const prisma = testModule.get(PrismaService);
    const persisted = await prisma.clinicalRecord.findUnique({ where: { id: record.id } });
    expect(persisted).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'CLINICAL_RECORD_ARCHIVED', entityId: record.id },
    });
    expect(audit).not.toBeNull();

    await expectApiError(
      service.archive(patientId, record.id, actor),
      'CLINICAL_RECORD_ALREADY_ARCHIVED',
    );
  });

  it('no permite archivar un registro que pertenece a otro paciente', async () => {
    const service = testModule.get(ClinicalRecordsService);
    const actor = await adminActor();
    const patientA = await createTestPatient(104);
    const patientB = await createTestPatient(105);

    const record = await service.create(
      patientA,
      { date: '2026-10-08', time: '12:00', reason: 'De A' },
      actor,
    );
    createdRecordIds.push(record.id);

    await expectApiError(service.archive(patientB, record.id, actor), 'CLINICAL_RECORD_NOT_FOUND');
    await expectApiError(
      service.archive(patientA, 'a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10', actor),
      'CLINICAL_RECORD_NOT_FOUND',
    );
  });
});
