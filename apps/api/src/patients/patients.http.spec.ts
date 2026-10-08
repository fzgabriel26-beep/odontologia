import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tests HTTP de pacientes (SDD, fase 4):401 sin sesión; personal con
 * `patients.read`/`patients.write` puede operar;403 sin permisos; validación
 * de body/UUID; búsqueda; archivar/restaurar y conflictos409.
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

/** DNI único por corrida (siempre 7 u 8 dígitos), con desplazamiento para no chocar con otros specs. */
function uniqueDni(offset = 0): string {
  return String((Date.now() % 9_000_000) + 1_000_000 + offset);
}

describe('Pacientes (HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let staffCookie: string;
  let noPermCookie: string;
  let noPermRoleId: string;
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

    // Personal con permisos de pacientes (rol ODONTOLOGO).
    const odontologoRole = await prisma.role.findUniqueOrThrow({ where: { key: 'ODONTOLOGO' } });
    const staff = await prisma.user.create({
      data: {
        email: `staff-pac-${Date.now()}@example.com`,
        passwordHash,
        firstName: 'Staff',
        lastName: 'Pacientes',
        dni: `5${Date.now().toString().slice(-7)}`,
        status: 'ACTIVO',
        roleId: odontologoRole.id,
      },
    });
    createdUserIds.push(staff.id);

    // Rol de prueba sin permisos (no existe en el seed) → debe recibir403.
    const emptyRole = await prisma.role.create({
      data: {
        key: `SIN_PERMISOS_${Date.now()}`,
        name: 'Sin permisos (test)',
        permissions: [],
      },
    });
    noPermRoleId = emptyRole.id;
    const noPermUser = await prisma.user.create({
      data: {
        email: `noperm-pac-${Date.now()}@example.com`,
        passwordHash,
        firstName: 'Sin',
        lastName: 'Permisos',
        dni: `6${Date.now().toString().slice(-7)}`,
        status: 'ACTIVO',
        roleId: emptyRole.id,
      },
    });
    createdUserIds.push(noPermUser.id);

    adminCookie = await login(
      process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local',
      process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!',
    );
    staffCookie = await login(staff.email, 'Consult10');
    noPermCookie = await login(noPermUser.email, 'Consult10');
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityType: 'PATIENT', entityId: { in: createdPatientIds } },
          { userId: { in: createdUserIds } },
          { entityId: { in: [...createdUserIds, noPermRoleId] } },
        ],
      },
    });
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

  it('rechaza con 401 los endpoints de pacientes sin sesión', async () => {
    const list = await request(app.getHttpServer()).get('/patients');
    expect(list.status).toBe(401);
    expect(list.body.error.code).toBe('UNAUTHORIZED');

    const create = await request(app.getHttpServer())
      .post('/patients')
      .send({ firstName: 'Sin', lastName: 'Sesion', dni: '30111222' });
    expect(create.status).toBe(401);
  });

  it('permite al personal con permisos listar y crear pacientes', async () => {
    const list = await request(app.getHttpServer()).get('/patients').set('Cookie', staffCookie);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);

    const dni = uniqueDni(100);
    const created = await request(app.getHttpServer())
      .post('/patients')
      .set('Cookie', staffCookie)
      .send({ firstName: 'Alta', lastName: 'Por HTTP', dni, phone: '11 3030-4040' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('ACTIVO');
    expect(created.body.dni).toBe(dni);
    createdPatientIds.push(created.body.id as string);

    const fetched = await request(app.getHttpServer())
      .get(`/patients/${created.body.id as string}`)
      .set('Cookie', staffCookie);
    expect(fetched.status).toBe(200);
    expect(fetched.body.firstName).toBe('Alta');
  });

  it('busca, edita y valida datos por HTTP', async () => {
    const dni = uniqueDni(101);
    const created = await request(app.getHttpServer())
      .post('/patients')
      .set('Cookie', adminCookie)
      .send({ firstName: 'Editable', lastName: 'HTTP', dni });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    createdPatientIds.push(id);

    // Búsqueda por apellido (CU-07).
    const search = await request(app.getHttpServer())
      .get('/patients')
      .query({ query: 'editable' })
      .set('Cookie', adminCookie);
    expect(search.status).toBe(200);
    expect((search.body as Array<{ id: string }>).some((patient) => patient.id === id)).toBe(true);

    // Edición parcial.
    const patched = await request(app.getHttpServer())
      .patch(`/patients/${id}`)
      .set('Cookie', adminCookie)
      .send({ phone: '11 5050-6060', notes: 'Desde HTTP' });
    expect(patched.status).toBe(200);
    expect(patched.body.phone).toBe('11 5050-6060');
    expect(patched.body.notes).toBe('Desde HTTP');

    // DNI duplicado → 409.
    const dniTaken = await request(app.getHttpServer())
      .post('/patients')
      .set('Cookie', adminCookie)
      .send({ firstName: 'Otro', lastName: 'Duplicado', dni });
    expect(dniTaken.status).toBe(409);
    expect(dniTaken.body.error.code).toBe('DNI_TAKEN');

    // Validaciones de entrada y ruta.
    const invalidBody = await request(app.getHttpServer())
      .post('/patients')
      .set('Cookie', adminCookie)
      .send({ firstName: 'X', lastName: 'Y', dni: '12' });
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body.error.code).toBe('VALIDATION_ERROR');
    expect(invalidBody.body.error.fields.dni).toBeDefined();

    const invalidId = await request(app.getHttpServer())
      .get('/patients/no-es-uuid')
      .set('Cookie', adminCookie);
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe('INVALID_ID');

    const invalidStatus = await request(app.getHttpServer())
      .get('/patients')
      .query({ status: 'BORRADO' })
      .set('Cookie', adminCookie);
    expect(invalidStatus.status).toBe(400);

    const missing = await request(app.getHttpServer())
      .get('/patients/a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10')
      .set('Cookie', adminCookie);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('PATIENT_NOT_FOUND');
  });

  it('rechaza con 403 al usuario sin permisos de pacientes', async () => {
    const list = await request(app.getHttpServer()).get('/patients').set('Cookie', noPermCookie);
    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('FORBIDDEN');

    const create = await request(app.getHttpServer())
      .post('/patients')
      .set('Cookie', noPermCookie)
      .send({ firstName: 'No', lastName: 'Autorizado', dni: uniqueDni(102) });
    expect(create.status).toBe(403);

    const anyPatientId = createdPatientIds[0];
    const get = await request(app.getHttpServer())
      .get(`/patients/${anyPatientId}`)
      .set('Cookie', noPermCookie);
    expect(get.status).toBe(403);

    const patch = await request(app.getHttpServer())
      .patch(`/patients/${anyPatientId}`)
      .set('Cookie', noPermCookie)
      .send({ phone: '11 0000-0000' });
    expect(patch.status).toBe(403);

    const archive = await request(app.getHttpServer())
      .post(`/patients/${anyPatientId}/archive`)
      .set('Cookie', noPermCookie);
    expect(archive.status).toBe(403);

    const restore = await request(app.getHttpServer())
      .post(`/patients/${anyPatientId}/restore`)
      .set('Cookie', noPermCookie);
    expect(restore.status).toBe(403);
  });

  it('archiva y restaura fichas por HTTP (con conflictos 409)', async () => {
    const dni = uniqueDni(103);
    const created = await request(app.getHttpServer())
      .post('/patients')
      .set('Cookie', adminCookie)
      .send({ firstName: 'Archivable', lastName: 'HTTP', dni });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    createdPatientIds.push(id);

    const archived = await request(app.getHttpServer())
      .post(`/patients/${id}/archive`)
      .set('Cookie', adminCookie);
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('ARCHIVADO');
    expect(archived.body.archivedAt).not.toBeNull();

    const twice = await request(app.getHttpServer())
      .post(`/patients/${id}/archive`)
      .set('Cookie', adminCookie);
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('PATIENT_ALREADY_ARCHIVED');

    const restored = await request(app.getHttpServer())
      .post(`/patients/${id}/restore`)
      .set('Cookie', adminCookie);
    expect(restored.status).toBe(200);
    expect(restored.body.status).toBe('ACTIVO');
    expect(restored.body.archivedAt).toBeNull();

    const restoreTwice = await request(app.getHttpServer())
      .post(`/patients/${id}/restore`)
      .set('Cookie', adminCookie);
    expect(restoreTwice.status).toBe(409);
    expect(restoreTwice.body.error.code).toBe('PATIENT_NOT_ARCHIVED');
  });
});
