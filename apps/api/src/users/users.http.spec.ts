import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tests HTTP de autorización del panel admin (SDD, fase 3):
 * sin sesión →401; sin permiso `users.manage`/`invitation.manage` →403;
 * validación de body y de UUID de ruta.
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

describe('Autorización del panel de administración (HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffEmail: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const { AppModule } = await import('../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);

    // Cuenta de personal (sin permisos de administración) para probar403.
    const argon2 = (await import('argon2')).default;
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'ODONTOLOGO' } });
    staffEmail = `staff-403-${Date.now()}@example.com`;
    const staff = await prisma.user.create({
      data: {
        email: staffEmail,
        passwordHash: await argon2.hash('Consult10', { type: argon2.argon2id }),
        firstName: 'Staff',
        lastName: 'SinPermiso',
        dni: `4${Date.now().toString().slice(-7)}`,
        status: 'ACTIVO',
        roleId: role.id,
      },
    });
    createdUserIds.push(staff.id);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ userId: { in: createdUserIds } }, { entityId: { in: createdUserIds } }],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app?.close();
  });

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    expect(response.status).toBe(200);
    return (response.headers['set-cookie'][0] as string).split(';')[0];
  }

  it('rechaza con401 cualquier endpoint admin sin sesión', async () => {
    const response = await request(app.getHttpServer()).get('/users');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('permite al administrador listar y crear usuarios', async () => {
    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!';
    const cookie = await login(adminEmail, adminPassword);

    const list = await request(app.getHttpServer()).get('/users').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThan(0);

    const suffix = Date.now();
    const created = await request(app.getHttpServer())
      .post('/users')
      .set('Cookie', cookie)
      .send({
        firstName: 'Creado',
        lastName: 'Por HTTP',
        dni: `3${suffix.toString().slice(-7)}`,
        email: `http-create-${suffix}@example.com`,
        password: 'Consult10',
        roleKey: 'SECRETARIO',
      });
    expect(created.status).toBe(201);
    expect(created.body.role.key).toBe('SECRETARIO');
    createdUserIds.push(created.body.id as string);
  });

  it('rechaza con403 al personal sin permisos de administración', async () => {
    const cookie = await login(staffEmail, 'Consult10');

    const users = await request(app.getHttpServer()).get('/users').set('Cookie', cookie);
    expect(users.status).toBe(403);
    expect(users.body.error.code).toBe('FORBIDDEN');

    const codes = await request(app.getHttpServer()).get('/invitation-codes').set('Cookie', cookie);
    expect(codes.status).toBe(403);

    const createCode = await request(app.getHttpServer())
      .post('/invitation-codes')
      .set('Cookie', cookie)
      .send({ roleKey: 'ODONTOLOGO' });
    expect(createCode.status).toBe(403);

    const changeRole = await request(app.getHttpServer())
      .post(`/users/${createdUserIds[0]}/role`)
      .set('Cookie', cookie)
      .send({ roleKey: 'ADMIN' });
    expect(changeRole.status).toBe(403);
  });

  it('valida el body y el UUID de la ruta', async () => {
    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!';
    const cookie = await login(adminEmail, adminPassword);

    const invalidId = await request(app.getHttpServer())
      .get('/users/no-es-uuid')
      .set('Cookie', cookie);
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe('INVALID_ID');

    const invalidBody = await request(app.getHttpServer())
      .post('/users')
      .set('Cookie', cookie)
      .send({ firstName: 'X', email: 'no-es-email' });
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body.error.code).toBe('VALIDATION_ERROR');

    const invalidRole = await request(app.getHttpServer())
      .post('/users/a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10/role')
      .set('Cookie', cookie)
      .send({ roleKey: 'SUPERVISOR' });
    expect(invalidRole.status).toBe(400);
  });
});
