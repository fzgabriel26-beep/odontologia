import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tests HTTP del panel de auditoría (SDD CU-15 / fase 9): 401 sin sesión;
 * 403 sin `audit.read`; listado con filtros por acción, usuario, paciente y
 * fechas; paginación; 400 en parámetros inválidos; y la invariante del
 * interceptor (las mutaciones con auditoría de dominio no generan filas
 * API_MUTATION en /patients).
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fecha UTC futura estable para esta corrida (nunca choca con corridas previas). */
function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

interface AuditRow {
  id: string;
  userId: string | null;
  user: { id: string; firstName: string; lastName: string } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

describe('Auditoría (HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let staffCookie: string;
  let staffId: string;
  let patientAId: string;
  let patientBId: string;
  let appointmentId: string;
  const today = utcToday();
  const tomorrow = addDaysIso(today, 1);
  const appointmentDate = addDaysIso(today, 44);
  const createdUserIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdAppointmentIds: string[] = [];

  async function bootstrap(): Promise<{ app: INestApplication; prisma: PrismaService }> {
    const { AppModule } = await import('../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const nestApp = moduleRef.createNestApplication();
    await nestApp.init();
    return { app: nestApp, prisma: moduleRef.get(PrismaService) };
  }

  beforeAll(async () => {
    const started = await bootstrap();
    app = started.app;
    prisma = started.prisma;

    const argon2 = (await import('argon2')).default;
    const passwordHash = await argon2.hash('Consult10', { type: argon2.argon2id });

    // Personal ODONTOLOGO (no tiene audit.read → 403 en el panel).
    const odontologoRole = await prisma.role.findUniqueOrThrow({ where: { key: 'ODONTOLOGO' } });
    const staff = await prisma.user.create({
      data: {
        email: `staff-audit-${Date.now()}@example.com`,
        passwordHash,
        firstName: 'Personal',
        lastName: 'Auditoria',
        dni: String((Date.now() % 9_000_000) + 1_000_000 + 630),
        status: 'ACTIVO',
        roleId: odontologoRole.id,
      },
    });
    createdUserIds.push(staff.id);
    staffId = staff.id;

    adminCookie = await login(
      process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local',
      process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!',
    );
    staffCookie = await login(staff.email, 'Consult10');
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityType: 'PATIENT', entityId: { in: createdPatientIds } },
          { entityType: 'APPOINTMENT', entityId: { in: createdAppointmentIds } },
          { userId: { in: createdUserIds } },
          { entityType: 'API' }, // filas del interceptor (todas son de tests)
        ],
      },
    });
    await prisma.appointmentEvent.deleteMany({
      where: { appointmentId: { in: createdAppointmentIds } },
    });
    await prisma.appointment.deleteMany({ where: { id: { in: createdAppointmentIds } } });
    await prisma.tooth.deleteMany({ where: { patientId: { in: createdPatientIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
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

  async function createPatient(lastName: string, dniOffset: number): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/patients')
      .set('Cookie', adminCookie)
      .send({
        firstName: 'Audit',
        lastName,
        dni: String((Date.now() % 9_000_000) + 1_000_000 + dniOffset),
      });
    expect(response.status).toBe(201);
    createdPatientIds.push(response.body.id);
    return response.body.id as string;
  }

  async function getAudit(query: string, cookie: string = adminCookie): Promise<AuditRow[]> {
    const response = await request(app.getHttpServer())
      .get(`/audit${query}`)
      .set('Cookie', cookie);
    if (response.status !== 200) {
      throw new Error(`GET /audit${query} respondió ${response.status}: ${JSON.stringify(response.body)}`);
    }
    return response.body as AuditRow[];
  }

  // Datos de la corrida: dos pacientes (vía HTTP, con auditoría explícita) y
  // un turno para el paciente A (metadata.patientId).
  it('prepara los datos de la corrida', async () => {
    patientAId = await createPatient('AuditA', 631);
    patientBId = await createPatient('AuditB', 632);

    const appointment = await request(app.getHttpServer())
      .post('/appointments')
      .set('Cookie', staffCookie)
      .send({
        patientId: patientAId,
        professionalId: staffId,
        date: appointmentDate,
        time: '10:00',
        durationMin: 30,
      });
    expect(appointment.status).toBe(201);
    createdAppointmentIds.push(appointment.body.id);
    appointmentId = appointment.body.id;
  });

  it('responde 401 sin sesión', async () => {
    const response = await request(app.getHttpServer()).get('/audit');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('responde 403 al personal sin audit.read', async () => {
    const response = await request(app.getHttpServer()).get('/audit').set('Cookie', staffCookie);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('lista los registros más recientes primero con autor y sin exceso por defecto', async () => {
    const rows = await getAudit('');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(50); // límite por defecto
    const timestamps = rows.map((row) => Date.parse(row.createdAt));
    for (let index = 1; index < timestamps.length; index += 1) {
      expect(timestamps[index]).toBeLessThanOrEqual(timestamps[index - 1] ?? 0);
    }
    const withUser = rows.find((row) => row.user !== null);
    expect(withUser?.user?.firstName).toBeTruthy();
    expect(withUser?.user?.lastName).toBeTruthy();
  });

  it('filtra por acción', async () => {
    const rows = await getAudit('?action=PATIENT_CREATED');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) expect(row.action).toBe('PATIENT_CREATED');
    const ids = rows.map((row) => row.entityId);
    expect(ids).toContain(patientAId);
    expect(ids).toContain(patientBId);
  });

  it('filtra por usuario', async () => {
    const rows = await getAudit(`?userId=${staffId}`);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.userId).toBe(staffId);
    expect(rows.some((row) => row.action === 'LOGIN')).toBe(true); // login del personal
  });

  it('filtra por rango de fechas (día de hoy y día vacío)', async () => {
    const day = await getAudit(`?userId=${staffId}&from=${today}&to=${today}`);
    expect(day.length).toBeGreaterThan(0);
    for (const row of day) expect(row.createdAt.slice(0, 10)).toBe(today);

    const emptyDay = await getAudit(`?userId=${staffId}&from=${tomorrow}&to=${tomorrow}`);
    expect(emptyDay).toEqual([]);
  });

  it('filtra por paciente (entidad y metadata) sin incluir a otros pacientes', async () => {
    const rows = await getAudit(`?patientId=${patientAId}&limit=500`);
    const created = rows.find(
      (row) => row.action === 'PATIENT_CREATED' && row.entityId === patientAId,
    );
    expect(created).toBeDefined();
    const appointment = rows.find((row) => row.action === 'APPOINTMENT_CREATED');
    expect(appointment?.entityId).toBe(appointmentId);
    expect(appointment?.metadata?.patientId).toBe(patientAId);

    for (const row of rows) {
      expect(row.entityId).not.toBe(patientBId);
      expect(row.metadata?.patientId).not.toBe(patientBId);
    }
  });

  it('pagina con limit y offset', async () => {
    const firstPage = await getAudit('?action=PATIENT_CREATED&limit=1');
    expect(firstPage).toHaveLength(1);
    const secondPage = await getAudit('?action=PATIENT_CREATED&limit=1&offset=1');
    expect(secondPage).toHaveLength(1);
    expect(secondPage[0]?.id).not.toBe(firstPage[0]?.id);
    expect(secondPage[0]?.action).toBe('PATIENT_CREATED');
  });

  it('responde 400 ante parámetros inválidos', async () => {
    const invalidAction = await request(app.getHttpServer())
      .get('/audit?action=BORRAR_TODO')
      .set('Cookie', adminCookie);
    expect(invalidAction.status).toBe(400);
    expect(invalidAction.body.error.code).toBe('VALIDATION_ERROR');

    const invalidUser = await request(app.getHttpServer())
      .get('/audit?userId=no-uuid')
      .set('Cookie', adminCookie);
    expect(invalidUser.status).toBe(400);

    const invertedRange = await request(app.getHttpServer())
      .get(`/audit?from=${tomorrow}&to=${today}`)
      .set('Cookie', adminCookie);
    expect(invertedRange.status).toBe(400);

    const zeroLimit = await request(app.getHttpServer())
      .get('/audit?limit=0')
      .set('Cookie', adminCookie);
    expect(zeroLimit.status).toBe(400);
  });

  it('no duplica API_MUTATION cuando la mutación ya auditó (interceptor)', async () => {
    // Edición de paciente con auditoría explícita PATIENT_UPDATED.
    const patch = await request(app.getHttpServer())
      .patch(`/patients/${patientAId}`)
      .set('Cookie', adminCookie)
      .send({ notes: 'auditoria-fase-9' });
    expect(patch.status).toBe(200);

    const updated = await getAudit('?action=PATIENT_UPDATED');
    expect(updated.some((row) => row.entityId === patientAId)).toBe(true);

    // Invariante: ninguna mutación de /patients quedó sin auditoría de dominio.
    const fallbacks = await getAudit('?action=API_MUTATION&limit=500');
    const patientFallbacks = fallbacks.filter((row) =>
      String(row.metadata?.path ?? '').startsWith('/patients'),
    );
    expect(patientFallbacks).toEqual([]);
  });
});
