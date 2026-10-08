import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AUDIT_ACTIONS, type AuditAction } from '@odonto/types';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tests de integración de autenticación (SDD, fase 2) contra PostgreSQL real:
 *
 *  - login correcto / incorrecto / email inexistente / usuario inactivo
 *  - registro por código: válido / usado / expirado / revocado
 *  - recuperación: token de un solo uso, revocación de sesiones, cambio de contraseña
 *  - auditoría de los eventos de sesión
 *
 * Requiere la base migrada y con seed (roles). Cada test crea y elimina sus datos.
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

const uniqueSuffix = (): string => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

interface CapturedMail {
  to: string;
  subject: string;
  text: string;
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

async function expectAuditAction(userId: string, action: AuditAction): Promise<void> {
  const prisma = testModule.get(PrismaService);
  const row = await prisma.auditLog.findFirst({ where: { userId, action } });
  expect(row, `Se esperaba un registro de auditoría ${action}`).not.toBeNull();
}

let testModule: TestingModule;
let sentMails: CapturedMail[] = [];
const createdUserIds: string[] = [];
const createdCodeIds: string[] = [];

/** Crea un usuario de prueba con contraseña segura. */
async function createUser(options?: { status?: 'ACTIVO' | 'INACTIVO' }): Promise<{
  id: string;
  email: string;
  password: string;
}> {
  const argon2 = (await import('argon2')).default;
  const prisma = testModule.get(PrismaService);
  const role = await prisma.role.upsert({
    where: { key: 'ODONTOLOGO' },
    update: {},
    create: { key: 'ODONTOLOGO', name: 'Odontólogo', permissions: [] },
  });
  const suffix = uniqueSuffix();
  const email = `auth-test-${suffix}@example.com`;
  const password = 'Consult10';
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      firstName: 'Test',
      lastName: `Auth ${suffix.slice(-4)}`,
      dni: `9${Date.now().toString().slice(-7)}`,
      status: options?.status ?? 'ACTIVO',
      roleId: role.id,
    },
  });
  createdUserIds.push(user.id);
  return { id: user.id, email, password };
}

/** Crea un código de invitación de prueba en el estado indicado. */
async function createInvitationCode(
  options: { expiresInMs?: number | null; revoked?: boolean } = {},
): Promise<{ id: string; code: string }> {
  const prisma = testModule.get(PrismaService);
  const creator = await createUser();
  const role = await prisma.role.upsert({
    where: { key: 'SECRETARIO' },
    update: {},
    create: { key: 'SECRETARIO', name: 'Secretario', permissions: [] },
  });
  const block = (): string => uniqueSuffix().slice(-4);
  const code = `ODONTO-${block()}-${block()}`;
  const invitation = await prisma.invitationCode.create({
    data: {
      code,
      roleId: role.id,
      createdById: creator.id,
      expiresAt:
        options.expiresInMs === null
          ? null
          : new Date(Date.now() + (options.expiresInMs ?? 60 * 60_000)),
      revokedAt: options.revoked ? new Date() : null,
      ...(options.revoked ? { status: 'REVOGADO' as const } : {}),
    },
  });
  createdCodeIds.push(invitation.id);
  return { id: invitation.id, code };
}

describe('AuthService (fase 2 — autenticación)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL no está definida (revisá .env en la raíz).');
    }

    sentMails = [];
    const { AppModule } = await import('../app.module');
    testModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('MAIL_PROVIDER')
      .useValue({
        send: async (message: CapturedMail) => {
          sentMails.push(message);
        },
      })
      .compile();

    await testModule.init();
  });

  afterAll(async () => {
    const prisma = testModule.get(PrismaService);
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.invitationCode.deleteMany({ where: { id: { in: createdCodeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await testModule.close();
  });

  describe('login', () => {
    it('acepta credenciales válidas, crea la sesión y audita el LOGIN', async () => {
      const authService = testModule.get(AuthService);
      const prisma = testModule.get(PrismaService);
      const user = await createUser();

      const result = await authService.login(
        { email: user.email, password: user.password },
        { ip: '127.0.0.1' },
      );

      expect(result.user.email).toBe(user.email);
      expect(result.user.role.key).toBe('ODONTOLOGO');
      expect(result.token).toBeTruthy();

      const session = await prisma.session.findFirst({ where: { userId: user.id } });
      expect(session).not.toBeNull();
      expect(session?.tokenHash).not.toBe(result.token); // solo se guarda el hash

      const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(refreshed.lastLoginAt).not.toBeNull();

      await expectAuditAction(user.id, 'LOGIN');
    });

    it('rechaza la contraseña incorrecta con mensaje genérico y audita LOGIN_FAILED', async () => {
      const authService = testModule.get(AuthService);
      const user = await createUser();

      await expectApiError(
        authService.login({ email: user.email, password: 'WrongPass1' }, {}),
        'INVALID_CREDENTIALS',
      );
      await expectAuditAction(user.id, 'LOGIN_FAILED');
    });

    it('responde igual para un email inexistente (no permite enumerar usuarios)', async () => {
      const authService = testModule.get(AuthService);

      await expectApiError(
        authService.login({ email: 'nadie-existe-aqui@example.com', password: 'Consult10' }, {}),
        'INVALID_CREDENTIALS',
      );
    });

    it('impide el login de un usuario inactivo', async () => {
      const authService = testModule.get(AuthService);
      const user = await createUser({ status: 'INACTIVO' });

      await expectApiError(
        authService.login({ email: user.email, password: user.password }, {}),
        'ACCOUNT_INACTIVE',
      );
      await expectAuditAction(user.id, 'LOGIN_FAILED');
    });
  });

  describe('registro por código de invitación', () => {
    const validRegister = (code: string, email: string) => ({
      firstName: 'Regina',
      lastName: 'Test',
      dni: `8${Date.now().toString().slice(-7)}`,
      email,
      password: 'Consult10',
      invitationCode: code,
    });

    it('crea la cuenta con el rol del código, lo consume y deja al usuario logueado', async () => {
      const authService = testModule.get(AuthService);
      const prisma = testModule.get(PrismaService);
      const invitation = await createInvitationCode();
      const email = `registro-ok-${uniqueSuffix()}@example.com`;

      const result = await authService.register(validRegister(invitation.code, email), {
        ip: '127.0.0.1',
      });

      expect(result.user.email).toBe(email);
      expect(result.user.role.key).toBe('SECRETARIO'); // rol que aportó el código
      expect(result.token).toBeTruthy();

      const used = await prisma.invitationCode.findUniqueOrThrow({ where: { id: invitation.id } });
      expect(used.status).toBe('UTILIZADO');
      expect(used.usedAt).not.toBeNull();
      expect(used.usedById).toBe(result.user.id);

      await expectAuditAction(result.user.id, 'USER_CREATED');
    });

    it('rechaza un código ya utilizado', async () => {
      const authService = testModule.get(AuthService);
      const prisma = testModule.get(PrismaService);
      const invitation = await createInvitationCode();
      const first = validRegister(invitation.code, `registro-1-${uniqueSuffix()}@example.com`);
      await authService.register(first, {});

      const second = validRegister(invitation.code, `registro-2-${uniqueSuffix()}@example.com`);
      await expectApiError(authService.register(second, {}), 'INVITATION_INVALID');

      const codes = await prisma.invitationCode.count({ where: { code: invitation.code } });
      expect(codes).toBe(1);
    });

    it('rechaza un código expirado', async () => {
      const authService = testModule.get(AuthService);
      const invitation = await createInvitationCode({ expiresInMs: -1000 });

      await expectApiError(
        authService.register(
          validRegister(invitation.code, `registro-exp-${uniqueSuffix()}@example.com`),
          {},
        ),
        'INVITATION_EXPIRED',
      );
    });

    it('rechaza un código revocado', async () => {
      const authService = testModule.get(AuthService);
      const invitation = await createInvitationCode({ revoked: true });

      await expectApiError(
        authService.register(
          validRegister(invitation.code, `registro-rev-${uniqueSuffix()}@example.com`),
          {},
        ),
        'INVITATION_REVOKED',
      );
    });
  });

  describe('recuperación de contraseña (MailProvider stub)', () => {
    it('emite un token de un solo uso, lo canjea y cierra las sesiones anteriores', async () => {
      const authService = testModule.get(AuthService);
      const sessionsService = testModule.get(SessionsService);
      const user = await createUser();

      // Sesión "abierta" antes del reset.
      const oldSession = await sessionsService.create(user.id, {});
      expect(await sessionsService.validate(oldSession.token)).not.toBeNull();

      const mailsBefore = sentMails.length;
      await authService.forgotPassword({ email: user.email }, { ip: '127.0.0.1' });

      // Respuesta silenciosa aunque el email no exista (sin enumeración).
      await authService.forgotPassword({ email: 'no-cuenta-aqui@example.com' }, {});
      expect(sentMails.length).toBe(mailsBefore + 1);

      const mail = sentMails[sentMails.length - 1];
      expect(mail.to).toBe(user.email);
      const tokenMatch = /token=([A-Za-z0-9_-]+)/.exec(mail.text);
      expect(tokenMatch).not.toBeNull();
      const resetToken = tokenMatch?.[1] ?? '';

      await authService.resetPassword(
        { token: resetToken, password: 'NuevaClave1' },
        { ip: '127.0.0.1' },
      );

      // La sesión anterior quedó revocada y la contraseña vieja deja de servir.
      expect(await sessionsService.validate(oldSession.token)).toBeNull();
      await expectApiError(
        authService.login({ email: user.email, password: user.password }, {}),
        'INVALID_CREDENTIALS',
      );

      const login = await authService.login({ email: user.email, password: 'NuevaClave1' }, {});
      expect(login.user.id).toBe(user.id);

      // El token no se puede reutilizar.
      await expectApiError(
        authService.resetPassword({ token: resetToken, password: 'OtraClave1' }, {}),
        'RESET_TOKEN_INVALID',
      );
    });

    it('cambia la contraseña con sesión activa y cierra las demás sesiones', async () => {
      const authService = testModule.get(AuthService);
      const sessionsService = testModule.get(SessionsService);
      const user = await createUser();

      const mainSession = await sessionsService.create(user.id, {});
      const otherSession = await sessionsService.create(user.id, {});
      const authUser = (await sessionsService.validate(mainSession.token))?.user;
      expect(authUser).toBeDefined();
      if (!authUser) return;

      // Contraseña actual incorrecta →401.
      await expectApiError(
        authService.changePassword(authUser, 'WrongPass1', 'NuevaClave1', {}),
        'INVALID_CREDENTIALS',
      );

      await authService.changePassword(authUser, user.password, 'NuevaClave1', {});

      // La sesión actual sigue viva; la de otro dispositivo, no.
      expect(await sessionsService.validate(mainSession.token)).not.toBeNull();
      expect(await sessionsService.validate(otherSession.token)).toBeNull();

      await expectAuditAction(user.id, 'PASSWORD_CHANGED');
    });
  });

  it('las acciones de auditoría usadas existen en el catálogo compartido', () => {
    for (const action of [
      'LOGIN',
      'LOGIN_FAILED',
      'LOGOUT',
      'USER_CREATED',
      'PASSWORD_CHANGED',
    ] as const) {
      expect(AUDIT_ACTIONS).toContain(action);
    }
  });
});
