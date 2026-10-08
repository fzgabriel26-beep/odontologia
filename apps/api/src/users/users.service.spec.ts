import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { SessionsService } from '../auth/sessions.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

/**
 * Tests de integración del módulo de usuarios (SDD, fase 3 / CU-05):
 * alta, edición, rol, estado, reset por administrador y protecciones
 * (no modificarte a vos mismo, acciones auditadas).
 *
 * Requiere BD migrada con seed (roles + admin). Cada test crea y elimina sus datos.
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

const uniqueSuffix = (): string => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

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
const createdUserIds: string[] = [];

async function createUser(roleKey: 'ADMIN' | 'ODONTOLOGO' | 'SECRETARIO'): Promise<{
  id: string;
  email: string;
  dni: string;
  password: string;
}> {
  const argon2 = (await import('argon2')).default;
  const prisma = testModule.get(PrismaService);
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  const suffix = uniqueSuffix();
  const email = `usuarios-test-${suffix}@example.com`;
  const password = 'Consult10';
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      firstName: 'Test',
      lastName: `Usuario ${suffix.slice(-4)}`,
      dni: `7${Date.now().toString().slice(-7)}`,
      status: 'ACTIVO',
      roleId: role.id,
    },
  });
  createdUserIds.push(user.id);
  return { id: user.id, email, dni: user.dni, password };
}

async function adminActor(): Promise<{ id: string; ip: string }> {
  const prisma = testModule.get(PrismaService);
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local';
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  return { id: admin.id, ip: '127.0.0.1' };
}

describe('UsersService (fase 3 — gestión de usuarios)', () => {
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
      where: { OR: [{ userId: { in: createdUserIds } }, { entityId: { in: createdUserIds } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await testModule.close();
  });

  it('crea usuarios con rol, los lista y audita USER_CREATED', async () => {
    const usersService = testModule.get(UsersService);
    const actor = await adminActor();
    const suffix = uniqueSuffix();

    const created = await usersService.create(
      {
        firstName: 'Alta',
        lastName: 'Prueba',
        dni: `6${suffix.slice(0, 7)}`,
        email: `alta-${suffix}@example.com`,
        password: 'Consult10',
        roleKey: 'SECRETARIO',
      },
      actor,
    );
    createdUserIds.push(created.id);

    expect(created.role.key).toBe('SECRETARIO');
    expect(created.status).toBe('ACTIVO');
    expect(JSON.stringify(created)).not.toContain('passwordHash');

    const listed = await usersService.list('alta-');
    expect(listed.some((user) => user.id === created.id)).toBe(true);

    const audit = await testModule
      .get(PrismaService)
      .auditLog.findFirst({ where: { action: 'USER_CREATED', entityId: created.id } });
    expect(audit).not.toBeNull();
  });

  it('rechaza email y DNI duplicados en alta y en edición', async () => {
    const usersService = testModule.get(UsersService);
    const actor = await adminActor();
    const original = await createUser('ODONTOLOGO');
    const duplicate = await createUser('ODONTOLOGO');

    await expectApiError(
      usersService.create(
        {
          firstName: 'Dup',
          lastName: 'Mail',
          dni: `5${Date.now().toString().slice(-7)}`,
          email: duplicate.email,
          password: 'Consult10',
          roleKey: 'ODONTOLOGO',
        },
        actor,
      ),
      'EMAIL_TAKEN',
    );

    await expectApiError(
      usersService.update(original.id, { email: duplicate.email }, actor),
      'EMAIL_TAKEN',
    );

    const other = await createUser('SECRETARIO');
    await expectApiError(usersService.update(other.id, { dni: duplicate.dni }, actor), 'DNI_TAKEN');
  });

  it('desactiva un usuario: cierra sesiones, bloquea login y audita; reactivarlo lo devuelve', async () => {
    const usersService = testModule.get(UsersService);
    const sessionsService = testModule.get(SessionsService);
    const authService = testModule.get(AuthService);
    const actor = await adminActor();
    const user = await createUser('ODONTOLOGO');

    const session = await sessionsService.create(user.id, {});
    expect(await sessionsService.validate(session.token)).not.toBeNull();

    const deactivated = await usersService.changeStatus(user.id, { status: 'INACTIVO' }, actor);
    expect(deactivated.status).toBe('INACTIVO');

    expect(await sessionsService.validate(session.token)).toBeNull();
    await expectApiError(
      authService.login({ email: user.email, password: user.password }, {}),
      'ACCOUNT_INACTIVE',
    );

    const audit = await testModule
      .get(PrismaService)
      .auditLog.findFirst({ where: { action: 'USER_STATUS_CHANGED', entityId: user.id } });
    expect(audit).not.toBeNull();

    const reactivated = await usersService.changeStatus(user.id, { status: 'ACTIVO' }, actor);
    expect(reactivated.status).toBe('ACTIVO');
    const login = await authService.login({ email: user.email, password: user.password }, {});
    expect(login.user.id).toBe(user.id);
  });

  it('cambia el rol de un usuario y el login refleja el nuevo rol', async () => {
    const usersService = testModule.get(UsersService);
    const authService = testModule.get(AuthService);
    const actor = await adminActor();
    const user = await createUser('ODONTOLOGO');

    const updated = await usersService.changeRole(user.id, { roleKey: 'SECRETARIO' }, actor);
    expect(updated.role.key).toBe('SECRETARIO');

    const login = await authService.login({ email: user.email, password: user.password }, {});
    expect(login.user.role.key).toBe('SECRETARIO');

    const audit = await testModule
      .get(PrismaService)
      .auditLog.findFirst({ where: { action: 'USER_ROLE_CHANGED', entityId: user.id } });
    expect(audit).not.toBeNull();
  });

  it('impide modificarte a vos mismo (estado, rol y contraseña)', async () => {
    const usersService = testModule.get(UsersService);
    const actor = await adminActor();

    await expectApiError(
      usersService.changeStatus(actor.id, { status: 'INACTIVO' }, actor),
      'SELF_ACTION_FORBIDDEN',
    );
    await expectApiError(
      usersService.changeRole(actor.id, { roleKey: 'ODONTOLOGO' }, actor),
      'SELF_ACTION_FORBIDDEN',
    );
    await expectApiError(
      usersService.resetPassword(actor.id, 'NuevaClave1', actor),
      'SELF_ACTION_FORBIDDEN',
    );
  });

  it('resetea la contraseña de otro usuario: cierra sesiones y audita', async () => {
    const usersService = testModule.get(UsersService);
    const sessionsService = testModule.get(SessionsService);
    const authService = testModule.get(AuthService);
    const actor = await adminActor();
    const user = await createUser('SECRETARIO');

    const session = await sessionsService.create(user.id, {});
    await usersService.resetPassword(user.id, 'NuevaClave1', actor);

    expect(await sessionsService.validate(session.token)).toBeNull();
    await expectApiError(
      authService.login({ email: user.email, password: user.password }, {}),
      'INVALID_CREDENTIALS',
    );
    const login = await authService.login({ email: user.email, password: 'NuevaClave1' }, {});
    expect(login.user.id).toBe(user.id);

    const audit = await testModule
      .get(PrismaService)
      .auditLog.findFirst({ where: { action: 'PASSWORD_RESET_BY_ADMIN', entityId: user.id } });
    expect(audit).not.toBeNull();
  });

  it('devuelve404 para un usuario inexistente', async () => {
    const usersService = testModule.get(UsersService);
    await expectApiError(
      usersService.get('a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10'),
      'USER_NOT_FOUND',
    );
  });
});
