import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tests HTTP de historia clínica (SDD, fase 5): 401 sin sesión; personal con
 * `clinical.read`/`clinical.write` opera; 403 sin permisos; validaciones de
 * fecha/hora/dientes; autor visible; archivar con 409 y 404 cruzado.
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

describe('Historia clínica (HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let staffCookie: string;
  let noPermCookie: string;
  let noPermRoleId: string;
  let patientId: string;
  let otherPatientId: string;
  const createdUserIds: string[] = [];
  const createdPatientIds: string[] = [];

  beforeAll(async () => {
    const { AppModule } = await import('../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const argon2 = (await import('argon2')).default;
    const passwordHash = await argon2.hash('Consult10', { type: argon2.argon2id });

    // Personal con permisos clínicos (rol ODONTOLOGO).
    const odontologoRole = await prisma.role.findUniqueOrThrow({ where: { key: 'ODONTOLOGO' } });
    const staff = await prisma.user.create({
      data: {
        email: `staff-clin-${Date.now()}@example.com`,
        passwordHash,
        firstName: 'Staff',
        lastName: 'Clinica',
        dni: `5${Date.now().toString().slice(-7)}`,
        status: 'ACTIVO',
        roleId: odontologoRole.id,
      },
    });
    createdUserIds.push(staff.id);

    // Rol de prueba sin permisos (no existe en el seed) → debe recibir 403.
    const emptyRole = await prisma.role.create({
      data: {
        key: `SIN_PERM_CLIN_${Date.now()}`,
        name: 'Sin permisos clínicos (test)',
        permissions: [],
      },
    });
    noPermRoleId = emptyRole.id;
    const noPermUser = await prisma.user.create({
      data: {
        email: `noperm-clin-${Date.now()}@example.com`,
        passwordHash,
        firstName: 'Sin',
        lastName: 'PermisosClinicos',
        dni: `6${Date.now().toString().slice(-7)}`,
        status: 'ACTIVO',
        roleId: emptyRole.id,
      },
    });
    createdUserIds.push(noPermUser.id);

    // Pacientes de prueba creados directamente (el CRUD ya está cubierto en fase 4).
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local' },
    });
    const suffix = Date.now() % 10_000_000;
    const patient = await prisma.patient.create({
      data: {
        firstName: 'Clinico',
        lastName: 'HTTP',
        dni: String(suffix),
        status: 'ACTIVO',
        createdById: admin.id,
      },
    });
    patientId = patient.id;
    createdPatientIds.push(patient.id);

    adminCookie = await login(
      process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local',
      process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!',
    );
    staffCookie = await login(staff.email, 'Consult10');
    noPermCookie = await login(noPermUser.email, 'Consult10');
  });

  afterAll(async () => {
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
          { userId: { in: createdUserIds } },
        ],
      },
    });
    await prisma.clinicalRecord.deleteMany({ where: { id: { in: recordIds } } });
    await prisma.tooth.deleteMany({ where: { patientId: { in: createdPatientIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.role.deleteMany({ where: { id: noPermRoleId } });
    await app?.close();
  });

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    expect(response.status).toBe(200);
    return (response.headers['set-cookie'][0] as string).split(';')[0];
  }

  it('rechaza con 401 los endpoints sin sesión', async () => {
    const list = await request(app.getHttpServer()).get(`/patients/${patientId}/records`);
    expect(list.status).toBe(401);
    expect(list.body.error.code).toBe('UNAUTHORIZED');

    const create = await request(app.getHttpServer())
      .post(`/patients/${patientId}/records`)
      .send({ date: '2026-10-08', time: '10:00', reason: 'Sin sesión' });
    expect(create.status).toBe(401);
  });

  it('permite al personal crear evoluciones y consultarlas con el autor', async () => {
    const created = await request(app.getHttpServer())
      .post(`/patients/${patientId}/records`)
      .set('Cookie', staffCookie)
      .send({
        date: '2026-10-08',
        time: '10:15',
        reason: 'Control general',
        diagnosis: 'Sin novedades',
        toothNumbers: [11, 21],
      });
    expect(created.status).toBe(201);
    expect(created.body.createdBy.id).toBeDefined();
    expect(created.body.createdBy.lastName).toBe('Clinica'); // autor visible
    expect(created.body.toothNumbers).toEqual([11, 21]);
    expect(created.body.archivedAt).toBeNull();

    const list = await request(app.getHttpServer())
      .get(`/patients/${patientId}/records`)
      .set('Cookie', staffCookie);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThan(0);
    const found = (list.body as Array<{ id: string; createdBy?: { lastName?: string } }>).find(
      (record) => record.id === created.body.id,
    );
    expect(found?.createdBy?.lastName).toBe('Clinica');
  });

  it('valida fecha, hora, contenido clínico, dientes y rutas', async () => {
    const badTime = await request(app.getHttpServer())
      .post(`/patients/${patientId}/records`)
      .set('Cookie', adminCookie)
      .send({ date: '2026-10-08', time: '25:00', reason: 'Hora mala' });
    expect(badTime.status).toBe(400);
    expect(badTime.body.error.code).toBe('VALIDATION_ERROR');
    expect(badTime.body.error.fields.time).toBeDefined();

    const emptyContent = await request(app.getHttpServer())
      .post(`/patients/${patientId}/records`)
      .set('Cookie', adminCookie)
      .send({ date: '2026-10-08', time: '10:00', reason: '', diagnosis: '   ' });
    expect(emptyContent.status).toBe(400);
    expect(emptyContent.body.error.fields.form).toBeDefined();

    const badTooth = await request(app.getHttpServer())
      .post(`/patients/${patientId}/records`)
      .set('Cookie', adminCookie)
      .send({ date: '2026-10-08', time: '10:00', reason: 'Diente malo', toothNumbers: [19] });
    expect(badTooth.status).toBe(400);
    expect(badTooth.body.error.fields.toothNumbers).toBeDefined();

    const invalidRecordId = await request(app.getHttpServer())
      .post(`/patients/${patientId}/records/no-es-uuid/archive`)
      .set('Cookie', adminCookie);
    expect(invalidRecordId.status).toBe(400);
    expect(invalidRecordId.body.error.code).toBe('INVALID_ID');

    const missingPatient = await request(app.getHttpServer())
      .get('/patients/a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10/records')
      .set('Cookie', adminCookie);
    expect(missingPatient.status).toBe(404);
    expect(missingPatient.body.error.code).toBe('PATIENT_NOT_FOUND');
  });

  it('rechaza con 403 al usuario sin permisos clínicos', async () => {
    const list = await request(app.getHttpServer())
      .get(`/patients/${patientId}/records`)
      .set('Cookie', noPermCookie);
    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('FORBIDDEN');

    const create = await request(app.getHttpServer())
      .post(`/patients/${patientId}/records`)
      .set('Cookie', noPermCookie)
      .send({ date: '2026-10-08', time: '10:00', reason: 'No autorizado' });
    expect(create.status).toBe(403);

    const archive = await request(app.getHttpServer())
      .post(`/patients/${patientId}/records/a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10/archive`)
      .set('Cookie', noPermCookie);
    expect(archive.status).toBe(403);
  });

  it('archiva por HTTP sin borrado, con 409 por doble archivado y 404 cruzado', async () => {
    const created = await request(app.getHttpServer())
      .post(`/patients/${patientId}/records`)
      .set('Cookie', adminCookie)
      .send({ date: '2026-10-08', time: '16:00', reason: 'Para archivar' });
    expect(created.status).toBe(201);
    const recordId = created.body.id as string;

    const archived = await request(app.getHttpServer())
      .post(`/patients/${patientId}/records/${recordId}/archive`)
      .set('Cookie', adminCookie);
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).not.toBeNull();

    // Sigue existiendo en la base (nunca se borra).
    const persisted = await prisma.clinicalRecord.findUnique({ where: { id: recordId } });
    expect(persisted).not.toBeNull();

    const listAfter = await request(app.getHttpServer())
      .get(`/patients/${patientId}/records`)
      .set('Cookie', adminCookie);
    expect((listAfter.body as Array<{ id: string }>).some((record) => record.id === recordId)).toBe(
      false,
    );

    const twice = await request(app.getHttpServer())
      .post(`/patients/${patientId}/records/${recordId}/archive`)
      .set('Cookie', adminCookie);
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('CLINICAL_RECORD_ALREADY_ARCHIVED');

    // Un registro no se archiva desde la URL de otro paciente.
    const other = await request(app.getHttpServer())
      .post(`/patients/${patientId}/records`)
      .set('Cookie', adminCookie)
      .send({ date: '2026-10-08', time: '17:00', reason: 'Registro propio' });
    const otherRecordId = other.body.id as string;

    const otherPatient = await prisma.patient.create({
      data: {
        firstName: 'Otro',
        lastName: 'Paciente',
        dni: String((Date.now() % 10_000_000) + 1),
        status: 'ACTIVO',
        createdById: (await prisma.user.findFirstOrThrow({ where: { role: { key: 'ADMIN' } } })).id,
      },
    });
    otherPatientId = otherPatient.id;
    createdPatientIds.push(otherPatient.id);

    const crossed = await request(app.getHttpServer())
      .post(`/patients/${otherPatientId}/records/${otherRecordId}/archive`)
      .set('Cookie', adminCookie);
    expect(crossed.status).toBe(404);
    expect(crossed.body.error.code).toBe('CLINICAL_RECORD_NOT_FOUND');
  });
});
