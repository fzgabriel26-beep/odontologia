import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { HttpException } from '@nestjs/common';
import { PERMANENT_TEETH_FDI, TEMPORARY_TEETH_FDI } from '@odonto/types';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from './patients.service';

/**
 * Tests de integración de pacientes (SDD, fase 4 / CU-06 y CU-07):
 * alta con 52 dientes FDI (ADR-006), DNI único, edición, búsqueda,
 * archivado/restauración sin borrado físico y auditoría.
 *
 * Requiere BD migrada con seed (roles + admin).
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

async function adminActor(): Promise<{ id: string; ip: string }> {
  const prisma = testModule.get(PrismaService);
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local';
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  return { id: admin.id, ip: '127.0.0.1' };
}

/** DNI único por corrida de tests (7 u 8 dígitos). */
function uniqueDni(offset = 0): string {
  // Siempre 7 u 8 dígitos (base en [1_000_000, 9_999_999] + desplazamiento).
  return String((Date.now() % 9_000_000) + 1_000_000 + offset);
}

describe('PatientsService (fase 4 — pacientes)', () => {
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
    await prisma.auditLog.deleteMany({
      where: { entityType: 'PATIENT', entityId: { in: createdPatientIds } },
    });
    await prisma.tooth.deleteMany({ where: { patientId: { in: createdPatientIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
    await testModule.close();
  });

  it('crea el paciente con sus 52 dientes FDI, estado ACTIVO y auditoría', async () => {
    const service = testModule.get(PatientsService);
    const actor = await adminActor();
    const dni = uniqueDni();

    const created = await service.create(
      {
        firstName: 'María',
        lastName: 'González',
        dni,
        birthDate: '1990-05-20',
        phone: '11 4444-5555',
        email: 'maria.gonzalez@example.com',
        address: '',
        allergies: 'Penicilina',
        notes: '',
      },
      actor,
    );
    createdPatientIds.push(created.id);

    expect(created.status).toBe('ACTIVO');
    expect(created.dni).toBe(dni);
    expect(created.firstName).toBe('María');
    expect(created.birthDate).not.toBeNull();
    // Campos vacíos se normalizan a null (nunca string vacío).
    expect(created.address).toBeNull();
    expect(created.notes).toBeNull();
    expect(created.allergies).toBe('Penicilina');
    expect(created.createdById).toBe(actor.id);

    // ADR-006: exactamente 52 dientes (32 permanentes + 20 temporales) y únicos.
    const prisma = testModule.get(PrismaService);
    const teeth = await prisma.tooth.findMany({ where: { patientId: created.id } });
    expect(teeth).toHaveLength(52);
    expect(teeth.filter((tooth) => tooth.type === 'PERMANENTE')).toHaveLength(32);
    expect(teeth.filter((tooth) => tooth.type === 'TEMPORAL')).toHaveLength(20);
    const fdiNumbers = teeth.map((tooth) => tooth.fdiNumber).sort((a, b) => a - b);
    const expected = [...PERMANENT_TEETH_FDI, ...TEMPORARY_TEETH_FDI].sort((a, b) => a - b);
    expect(fdiNumbers).toEqual(expected);
    expect(teeth.every((tooth) => tooth.currentStatus === 'SANO')).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'PATIENT_CREATED', entityId: created.id },
    });
    expect(audit).not.toBeNull();
  });

  it('rechaza el alta con un DNI ya existente', async () => {
    const service = testModule.get(PatientsService);
    const actor = await adminActor();
    const dni = uniqueDni(1);

    const first = await service.create({ firstName: 'Duplicado', lastName: 'Primero', dni }, actor);
    createdPatientIds.push(first.id);

    await expectApiError(
      service.create({ firstName: 'Duplicado', lastName: 'Segundo', dni }, actor),
      'DNI_TAKEN',
    );
  });

  it('edita la ficha de forma parcial y audita los campos modificados', async () => {
    const service = testModule.get(PatientsService);
    const actor = await adminActor();
    const dni = uniqueDni(2);

    const created = await service.create(
      { firstName: 'Editable', lastName: 'Paciente', dni, phone: '11 1111-1111' },
      actor,
    );
    createdPatientIds.push(created.id);

    const updated = await service.update(
      created.id,
      { phone: '11 2222-2222', notes: 'Control anual' },
      actor,
    );
    expect(updated.phone).toBe('11 2222-2222');
    expect(updated.notes).toBe('Control anual');
    // Los campos no enviados quedan intactos.
    expect(updated.firstName).toBe('Editable');
    expect(updated.dni).toBe(dni);

    const prisma = testModule.get(PrismaService);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'PATIENT_UPDATED', entityId: created.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    const metadata = audit?.metadata as { fields?: string[] } | null;
    expect(metadata?.fields).toEqual(expect.arrayContaining(['phone', 'notes']));
  });

  it('valida DNI duplicado en edición, actualizaciones vacías e IDs inexistentes', async () => {
    const service = testModule.get(PatientsService);
    const actor = await adminActor();
    const dniA = uniqueDni(3);
    const dniB = uniqueDni(4);

    const patientA = await service.create({ firstName: 'Uno', lastName: 'Dni', dni: dniA }, actor);
    createdPatientIds.push(patientA.id);
    const patientB = await service.create({ firstName: 'Dos', lastName: 'Dni', dni: dniB }, actor);
    createdPatientIds.push(patientB.id);

    await expectApiError(service.update(patientB.id, { dni: dniA }, actor), 'DNI_TAKEN');
    await expectApiError(service.update(patientA.id, {}, actor), 'NOTHING_TO_UPDATE');
    await expectApiError(
      service.update('a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10', { phone: '11' }, actor),
      'PATIENT_NOT_FOUND',
    );
    await expectApiError(service.get('a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10'), 'PATIENT_NOT_FOUND');
  });

  it('busca por apellido, DNI, teléfono y email, y filtra por estado', async () => {
    const service = testModule.get(PatientsService);
    const actor = await adminActor();
    const dni = uniqueDni(5);

    const created = await service.create(
      {
        firstName: 'Búsqueda',
        lastName: 'ZZZmarcial',
        dni,
        phone: '11 7788-9900',
        email: 'busqueda.test@example.com',
      },
      actor,
    );
    createdPatientIds.push(created.id);

    const byLastName = await service.list({ query: 'zzzmarcial' });
    expect(byLastName.some((patient) => patient.id === created.id)).toBe(true);

    const byDni = await service.list({ query: dni });
    expect(byDni.some((patient) => patient.id === created.id)).toBe(true);

    const byPhone = await service.list({ query: '7788-9900' });
    expect(byPhone.some((patient) => patient.id === created.id)).toBe(true);

    const byEmail = await service.list({ query: 'busqueda.test' });
    expect(byEmail.some((patient) => patient.id === created.id)).toBe(true);

    const noMatch = await service.list({ query: 'no-existe-9x8w7v' });
    expect(noMatch.some((patient) => patient.id === created.id)).toBe(false);

    // Estado: antes de archivar figura en ACTIVO y no en ARCHIVADO.
    const activos = await service.list({ status: 'ACTIVO' });
    expect(activos.some((patient) => patient.id === created.id)).toBe(true);
    const archivados = await service.list({ status: 'ARCHIVADO' });
    expect(archivados.some((patient) => patient.id === created.id)).toBe(false);
  });

  it('archiva sin borrar físicamente, audita y bloquea archivar dos veces', async () => {
    const service = testModule.get(PatientsService);
    const actor = await adminActor();
    const dni = uniqueDni(6);

    const created = await service.create(
      { firstName: 'Archivable', lastName: 'Paciente', dni },
      actor,
    );
    createdPatientIds.push(created.id);

    const archived = await service.archive(created.id, actor);
    expect(archived.status).toBe('ARCHIVADO');
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.dni).toBe(dni);

    const prisma = testModule.get(PrismaService);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'PATIENT_ARCHIVED', entityId: created.id },
    });
    expect(audit).not.toBeNull();

    // Sigue existiendo en la base (nunca se borra) con sus 52 dientes.
    const persisted = await prisma.patient.findUnique({ where: { id: created.id } });
    expect(persisted).not.toBeNull();
    const teeth = await prisma.tooth.count({ where: { patientId: created.id } });
    expect(teeth).toBe(52);

    await expectApiError(service.archive(created.id, actor), 'PATIENT_ALREADY_ARCHIVED');
  });

  it('restaura una ficha archivada y audita el cambio de estado', async () => {
    const service = testModule.get(PatientsService);
    const actor = await adminActor();
    const dni = uniqueDni(7);

    const created = await service.create(
      { firstName: 'Temporal', lastName: 'Archivado', dni },
      actor,
    );
    createdPatientIds.push(created.id);
    await service.archive(created.id, actor);

    const restored = await service.restore(created.id, actor);
    expect(restored.status).toBe('ACTIVO');
    expect(restored.archivedAt).toBeNull();

    const prisma = testModule.get(PrismaService);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'PATIENT_UPDATED', entityId: created.id },
      orderBy: { createdAt: 'desc' },
    });
    const metadata = audit?.metadata as { to?: string } | null;
    expect(metadata?.to).toBe('ACTIVO');

    await expectApiError(service.restore(created.id, actor), 'PATIENT_NOT_ARCHIVED');
  });
});
