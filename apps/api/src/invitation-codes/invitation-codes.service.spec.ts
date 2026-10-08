import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { InvitationCodesService } from './invitation-codes.service';

/**
 * Tests de integración de códigos de invitación (SDD, fase 3 / CU-04):
 * generación con rol y expiración, exponer vencidos y revocación.
 *
 * Requiere BD migrada con seed (roles + admin).
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

const CODE_FORMAT = /^ODONTO-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

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
const createdCodeIds: string[] = [];

async function adminActor(): Promise<{ id: string; ip: string }> {
  const prisma = testModule.get(PrismaService);
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local';
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  return { id: admin.id, ip: '127.0.0.1' };
}

describe('InvitationCodesService (fase 3 — códigos de invitación)', () => {
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
      where: { entityType: 'INVITATION_CODE', entityId: { in: createdCodeIds } },
    });
    await prisma.invitationCode.deleteMany({ where: { id: { in: createdCodeIds } } });
    await testModule.close();
  });

  it('genera un código con formato, rol, expiración y auditoría', async () => {
    const codesService = testModule.get(InvitationCodesService);
    const actor = await adminActor();

    const created = await codesService.create({ roleKey: 'ODONTOLOGO', expiresInDays: 7 }, actor);
    createdCodeIds.push(created.id);

    expect(created.code).toMatch(CODE_FORMAT);
    expect(created.status).toBe('DISPONIBLE');
    expect(created.displayStatus).toBe('DISPONIBLE');
    expect(created.role.key).toBe('ODONTOLOGO');
    expect(created.expiresAt).not.toBeNull();
    const expected = Date.now() + 7 * 24 * 60 * 60_000;
    expect(Math.abs(created.expiresAt!.getTime() - expected)).toBeLessThan(60_000);

    const audit = await testModule
      .get(PrismaService)
      .auditLog.findFirst({ where: { action: 'INVITATION_CODE_CREATED', entityId: created.id } });
    expect(audit).not.toBeNull();

    // Aparece en el listado.
    const listed = await codesService.list();
    expect(listed.some((code) => code.id === created.id)).toBe(true);
  });

  it('permite generar códigos sin expiración', async () => {
    const codesService = testModule.get(InvitationCodesService);
    const actor = await adminActor();

    const created = await codesService.create({ roleKey: 'SECRETARIO' }, actor);
    createdCodeIds.push(created.id);

    expect(created.expiresAt).toBeNull();
    expect(created.code).toMatch(CODE_FORMAT);
  });

  it('muestra como EXPIRADO un código DISPONIBLE ya vencido', async () => {
    const codesService = testModule.get(InvitationCodesService);
    const prisma = testModule.get(PrismaService);
    const actor = await adminActor();

    const created = await codesService.create({ roleKey: 'ODONTOLOGO', expiresInDays: 1 }, actor);
    createdCodeIds.push(created.id);
    // Simula el paso del tiempo forzando la expiración.
    await prisma.invitationCode.update({
      where: { id: created.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const listed = await codesService.list();
    const found = listed.find((code) => code.id === created.id);
    expect(found?.status).toBe('DISPONIBLE'); // persistido
    expect(found?.displayStatus).toBe('EXPIRADO'); // calculado para la UI
  });

  it('revoca un código, audita y no permite revocarlo dos veces', async () => {
    const codesService = testModule.get(InvitationCodesService);
    const actor = await adminActor();

    const created = await codesService.create({ roleKey: 'SECRETARIO' }, actor);
    createdCodeIds.push(created.id);

    const revoked = await codesService.revoke(created.id, actor);
    expect(revoked.status).toBe('REVOGADO');
    expect(revoked.revokedAt).not.toBeNull();

    const audit = await testModule
      .get(PrismaService)
      .auditLog.findFirst({ where: { action: 'INVITATION_CODE_REVOKED', entityId: created.id } });
    expect(audit).not.toBeNull();

    await expectApiError(codesService.revoke(created.id, actor), 'CODE_NOT_AVAILABLE');
  });

  it('devuelve404 para un código inexistente', async () => {
    const codesService = testModule.get(InvitationCodesService);
    const actor = await adminActor();
    await expectApiError(
      codesService.revoke('a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10', actor),
      'CODE_NOT_FOUND',
    );
  });
});
