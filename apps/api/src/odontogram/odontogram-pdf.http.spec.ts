import { existsSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tests HTTP del PDF del odontograma (SDD CU-11 / ADR-004 / fase 10):
 * 401 sin sesión; personal con `odontogram.read` recibe un PDF real (%PDF,
 * encabezado de descarga, sin cache) auditado contra el paciente; 403 sin
 * permisos; 400/404 por id inválido o paciente inexistente.
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

/** Parser binario: superagent solo bufferea JSON/texto por defecto. */
function binaryParser(
  res: IncomingMessage,
  callback: (err: Error | null, body?: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('PDF del odontograma (HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let staffCookie: string;
  let noPermCookie: string;
  let noPermRoleId: string;
  let staffId: string;
  let patientId: string;
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
        email: `staff-pdf-${Date.now()}@example.com`,
        passwordHash,
        firstName: 'Staff',
        lastName: 'Pdf',
        dni: `9${Date.now().toString().slice(-7)}`,
        status: 'ACTIVO',
        roleId: odontologoRole.id,
      },
    });
    createdUserIds.push(staff.id);
    staffId = staff.id;

    // Rol sin permisos → 403 en la exportación.
    const emptyRole = await prisma.role.create({
      data: {
        key: `SIN_PERM_PDF_${Date.now()}`,
        name: 'Sin permisos de odontograma (test PDF)',
        permissions: [],
      },
    });
    noPermRoleId = emptyRole.id;
    const noPermUser = await prisma.user.create({
      data: {
        email: `noperm-pdf-${Date.now()}@example.com`,
        passwordHash,
        firstName: 'Sin',
        lastName: 'PermisoPdf',
        dni: `6${Date.now().toString().slice(-7)}`,
        status: 'ACTIVO',
        roleId: emptyRole.id,
      },
    });
    createdUserIds.push(noPermUser.id);

    // Paciente de prueba vía PatientsService (crea los 52 dientes).
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local' },
    });
    const patientsService = moduleRef.get(PatientsService);
    const patient = await patientsService.create(
      {
        firstName: 'Exportación',
        lastName: 'Pdf Test',
        dni: String((Date.now() % 9_000_000) + 1_000_000 + 650),
        birthDate: '1990-03-15',
      },
      { id: admin.id, ip: '127.0.0.1' },
    );
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
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityType: 'PATIENT', entityId: { in: createdPatientIds } },
          { userId: { in: createdUserIds } },
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

  it('rechaza con 401 la exportación sin sesión', async () => {
    const response = await request(app.getHttpServer()).get(
      `/patients/${patientId}/odontogram.pdf`,
    );
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it(
    'genera el PDF con sesión: %PDF, descarga, sin cache y auditoría del paciente',
    async () => {
      const response = await request(app.getHttpServer())
        .get(`/patients/${patientId}/odontogram.pdf`)
        .set('Cookie', staffCookie)
        .buffer(true)
        .parse(binaryParser)
        .expect(200);

      // Encabezados de descarga.
      expect(response.headers['content-type']).toBe('application/pdf');
      const disposition = response.headers['content-disposition'] as string;
      expect(disposition).toMatch(/^attachment; filename="odontograma-pdf-test-\d+\.pdf"$/);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toBe('private, no-store');

      // Binario PDF real, generado por Playwright.
      const body = response.body as Buffer;
      expect(Buffer.isBuffer(body)).toBe(true);
      expect(body.byteLength).toBeGreaterThan(2_000);
      expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(body.subarray(-16).toString('latin1')).toContain('%%EOF');

      // Auditoría de acceso a información clínica (visible en la ficha).
      const entry = await prisma.auditLog.findFirst({
        where: {
          action: 'ODONTOGRAM_PDF_EXPORTED',
          entityType: 'PATIENT',
          entityId: patientId,
          userId: staffId,
        },
      });
      expect(entry).not.toBeNull();
      expect(entry?.metadata).toMatchObject({ patientId });
    },
    60_000,
  );

  it('rechaza con 403 al usuario sin permisos de odontograma', async () => {
    const response = await request(app.getHttpServer())
      .get(`/patients/${patientId}/odontogram.pdf`)
      .set('Cookie', noPermCookie);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('valida el id de ruta y que el paciente exista', async () => {
    const badUuid = await request(app.getHttpServer())
      .get('/patients/no-es-uuid/odontogram.pdf')
      .set('Cookie', adminCookie);
    expect(badUuid.status).toBe(400);
    expect(badUuid.body.error.code).toBe('INVALID_ID');

    const missing = await request(app.getHttpServer())
      .get('/patients/a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10/odontogram.pdf')
      .set('Cookie', adminCookie);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('PATIENT_NOT_FOUND');
  });

  it('responde solo vía proxy autenticado (sin endpoint público de PDF)', async () => {
    // No existe una URL de PDF sin sesión ni permiso: la misma ruta sin
    // cookie cae en SessionGuard (401), ya validado arriba; acá verificamos
    // que el archivo no se cachea ni se sirve con cookies ajenas.
    const response = await request(app.getHttpServer())
      .get(`/patients/${patientId}/odontogram.pdf`)
      .set('Cookie', 'odon_session=token-falso');
    expect(response.status).toBe(401);
  });
});
