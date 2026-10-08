import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tests HTTP del odontograma (SDD, fase 6): 401 sin sesión; personal con
 * `odontogram.read`/`odontogram.write` opera (52 dientes, evento que cambia el
 * estado, historial con autor, observaciones); 403 sin permisos; validaciones;
 * historial ordenado y sin endpoint de borrado.
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

describe('Odontograma (HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let staffCookie: string;
  let noPermCookie: string;
  let noPermRoleId: string;
  let patientId: string;
  let tooth16Id: string;
  let tooth36Id: string;
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

    // Personal con permisos de odontograma (rol ODONTOLOGO).
    const odontologoRole = await prisma.role.findUniqueOrThrow({ where: { key: 'ODONTOLOGO' } });
    const staff = await prisma.user.create({
      data: {
        email: `staff-odonto-${Date.now()}@example.com`,
        passwordHash,
        firstName: 'Staff',
        lastName: 'Odontograma',
        dni: `7${Date.now().toString().slice(-7)}`,
        status: 'ACTIVO',
        roleId: odontologoRole.id,
      },
    });
    createdUserIds.push(staff.id);

    // Rol de prueba sin permisos (no existe en el seed) → debe recibir 403.
    const emptyRole = await prisma.role.create({
      data: {
        key: `SIN_PERM_ODON_${Date.now()}`,
        name: 'Sin permisos de odontograma (test)',
        permissions: [],
      },
    });
    noPermRoleId = emptyRole.id;
    const noPermUser = await prisma.user.create({
      data: {
        email: `noperm-odonto-${Date.now()}@example.com`,
        passwordHash,
        firstName: 'Sin',
        lastName: 'PermisosOdontograma',
        dni: `8${Date.now().toString().slice(-7)}`,
        status: 'ACTIVO',
        roleId: emptyRole.id,
      },
    });
    createdUserIds.push(noPermUser.id);

    // Paciente de prueba vía PatientsService (crea los 52 dientes en transacción;
    // el CRUD ya está cubierto en fase 4).
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local' },
    });
    const patientsService = moduleRef.get(PatientsService);
    const patient = await patientsService.create(
      {
        firstName: 'Odontograma',
        lastName: 'HTTP',
        dni: String((Date.now() % 10_000_000) + 300),
      },
      { id: admin.id, ip: '127.0.0.1' },
    );
    patientId = patient.id;
    createdPatientIds.push(patient.id);
    tooth16Id = (
      await prisma.tooth.findUniqueOrThrow({
        where: { patientId_fdiNumber: { patientId, fdiNumber: 16 } },
        select: { id: true },
      })
    ).id;
    tooth36Id = (
      await prisma.tooth.findUniqueOrThrow({
        where: { patientId_fdiNumber: { patientId, fdiNumber: 36 } },
        select: { id: true },
      })
    ).id;

    adminCookie = await login(
      process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local',
      process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!',
    );
    staffCookie = await login(staff.email, 'Consult10');
    noPermCookie = await login(noPermUser.email, 'Consult10');
  });

  afterAll(async () => {
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
          { userId: { in: createdUserIds } },
        ],
      },
    });
    await prisma.toothEvent.deleteMany({ where: { id: { in: eventIds } } });
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
    const teeth = await request(app.getHttpServer()).get(`/patients/${patientId}/teeth`);
    expect(teeth.status).toBe(401);
    expect(teeth.body.error.code).toBe('UNAUTHORIZED');

    const event = await request(app.getHttpServer())
      .post(`/teeth/${tooth16Id}/events`)
      .send({ status: 'CARIES' });
    expect(event.status).toBe(401);
  });

  it('permite al personal operar: 52 dientes, evento que cambia el estado, historial y observaciones', async () => {
    // Seleccionar: el odontograma trae los 52 dientes ordenados por FDI.
    const before = await request(app.getHttpServer())
      .get(`/patients/${patientId}/teeth`)
      .set('Cookie', staffCookie);
    expect(before.status).toBe(200);
    expect(before.body).toHaveLength(52);
    const firstFdi = (before.body as Array<{ fdiNumber: number }>)[0]?.fdiNumber;
    expect(firstFdi).toBe(11);

    // Registrar evento (estado) con autor.
    const created = await request(app.getHttpServer())
      .post(`/teeth/${tooth16Id}/events`)
      .set('Cookie', staffCookie)
      .send({ status: 'CARIES', note: 'Caries oclusal', eventDate: '2026-10-08' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('CARIES');
    expect(created.body.createdBy.lastName).toBe('Odontograma');
    expect(created.body.createdBy.id).toBeDefined();

    // El estado actual del diente queda actualizado (lectura posterior).
    const after = await request(app.getHttpServer())
      .get(`/patients/${patientId}/teeth`)
      .set('Cookie', staffCookie);
    const tooth16 = (after.body as Array<{ id: string; currentStatus: string }>).find(
      (tooth) => tooth.id === tooth16Id,
    );
    expect(tooth16?.currentStatus).toBe('CARIES');

    // Historial del diente con el evento y su autor.
    const events = await request(app.getHttpServer())
      .get(`/teeth/${tooth16Id}/events`)
      .set('Cookie', staffCookie);
    expect(events.status).toBe(200);
    const found = (events.body as Array<{ id: string; createdBy?: { lastName?: string } }>).find(
      (event) => event.id === created.body.id,
    );
    expect(found?.createdBy?.lastName).toBe('Odontograma');

    // Observaciones del diente (panel lateral).
    const patch = await request(app.getHttpServer())
      .patch(`/teeth/${tooth16Id}`)
      .set('Cookie', staffCookie)
      .send({ observations: 'Corona indicada para 2027' });
    expect(patch.status).toBe(200);
    expect(patch.body.observations).toBe('Corona indicada para 2027');
  });

  it('valida estado, fecha, rutas y body vacío', async () => {
    const badStatus = await request(app.getHttpServer())
      .post(`/teeth/${tooth16Id}/events`)
      .set('Cookie', adminCookie)
      .send({ status: 'NO_EXISTE' });
    expect(badStatus.status).toBe(400);
    expect(badStatus.body.error.code).toBe('VALIDATION_ERROR');
    expect(badStatus.body.error.fields.status).toBe('Estado dental inválido.');

    const badDate = await request(app.getHttpServer())
      .post(`/teeth/${tooth16Id}/events`)
      .set('Cookie', adminCookie)
      .send({ status: 'SANO', eventDate: '08/10/2026' });
    expect(badDate.status).toBe(400);
    expect(badDate.body.error.fields.eventDate).toBeDefined();

    const badUuid = await request(app.getHttpServer())
      .post('/teeth/no-es-uuid/events')
      .set('Cookie', adminCookie)
      .send({ status: 'SANO' });
    expect(badUuid.status).toBe(400);
    expect(badUuid.body.error.code).toBe('INVALID_ID');

    const missingPatient = await request(app.getHttpServer())
      .get('/patients/a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10/teeth')
      .set('Cookie', adminCookie);
    expect(missingPatient.status).toBe(404);
    expect(missingPatient.body.error.code).toBe('PATIENT_NOT_FOUND');

    const missingTooth = await request(app.getHttpServer())
      .get('/teeth/a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10/events')
      .set('Cookie', adminCookie);
    expect(missingTooth.status).toBe(404);
    expect(missingTooth.body.error.code).toBe('TOOTH_NOT_FOUND');

    const emptyPatch = await request(app.getHttpServer())
      .patch(`/teeth/${tooth16Id}`)
      .set('Cookie', adminCookie)
      .send({});
    expect(emptyPatch.status).toBe(400);
    expect(emptyPatch.body.error.fields.form).toBe('No hay datos para actualizar.');
  });

  it('rechaza con 403 al usuario sin permisos de odontograma', async () => {
    const teeth = await request(app.getHttpServer())
      .get(`/patients/${patientId}/teeth`)
      .set('Cookie', noPermCookie);
    expect(teeth.status).toBe(403);
    expect(teeth.body.error.code).toBe('FORBIDDEN');

    const event = await request(app.getHttpServer())
      .post(`/teeth/${tooth16Id}/events`)
      .set('Cookie', noPermCookie)
      .send({ status: 'CARIES' });
    expect(event.status).toBe(403);

    const patch = await request(app.getHttpServer())
      .patch(`/teeth/${tooth16Id}`)
      .set('Cookie', noPermCookie)
      .send({ observations: 'No autorizado' });
    expect(patch.status).toBe(403);
  });

  it('conserva el historial ordenado y no expone borrado de eventos', async () => {
    const older = await request(app.getHttpServer())
      .post(`/teeth/${tooth36Id}/events`)
      .set('Cookie', adminCookie)
      .send({ status: 'ENDODONCIA', eventDate: '2026-09-01' });
    expect(older.status).toBe(201);
    const newer = await request(app.getHttpServer())
      .post(`/teeth/${tooth36Id}/events`)
      .set('Cookie', adminCookie)
      .send({ status: 'CORONA', eventDate: '2026-10-08' });
    expect(newer.status).toBe(201);

    const events = await request(app.getHttpServer())
      .get(`/teeth/${tooth36Id}/events`)
      .set('Cookie', adminCookie);
    expect(events.status).toBe(200);
    const ids = (events.body as Array<{ id: string }>).map((event) => event.id);
    expect(ids[0]).toBe(newer.body.id);
    expect(ids[1]).toBe(older.body.id);

    // No existe endpoint de borrado: los eventos son ineliminables.
    const del = await request(app.getHttpServer())
      .delete(`/teeth/${tooth36Id}/events`)
      .set('Cookie', adminCookie);
    expect(del.status).toBe(404);
    const persisted = await prisma.toothEvent.count({ where: { toothId: tooth36Id } });
    expect(persisted).toBeGreaterThanOrEqual(2);
  });
});
