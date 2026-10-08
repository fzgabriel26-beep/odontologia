import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tests HTTP de la agenda de turnos (SDD, fase 8): 401 sin sesión; 403 sin
 * permisos; alta con validaciones; listado con filtros; detalle con historial;
 * máquina de estados (transiciones válidas, inválidas y motivo obligatorio en
 * cancelación/ausencia); edición; seña (CU-14); estadísticas; turnos por
 * paciente; y auditoría APPOINTMENT_* / SIGNA_REGISTERED.
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

const FAR_FUTURE_ID = '00000000-0000-4000-8000-000000000000';

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fecha UTC futura estable para esta corrida (nunca choca con corridas previas). */
function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('Agenda de turnos (HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let staffCookie: string;
  let noPermCookie: string;
  let noPermRoleId: string;
  let patientId: string;
  let staffId: string;
  let adminId: string;

  // Turnos creados por la corrida (limpieza en afterAll).
  let apptToday: string; // A: cadena completa hasta ATENDIDO
  let apptCancel: string; // B: cancelado con motivo
  let apptAbsent: string; // C: ausente con motivo
  let apptEdit: string; // D: edición de campos
  let apptSigna: string; // E: seña
  const today = utcToday();
  const dateD1 = addDaysIso(today, 44);
  const dateD2 = addDaysIso(today, 46);
  const dateD3 = addDaysIso(today, 47);
  const createdAppointmentIds: string[] = [];
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

    // Personal con permisos de agenda (rol ODONTOLOGO).
    const odontologoRole = await prisma.role.findUniqueOrThrow({ where: { key: 'ODONTOLOGO' } });
    const staff = await prisma.user.create({
      data: {
        email: `staff-agenda-${Date.now()}@example.com`,
        passwordHash,
        firstName: 'Profesional',
        lastName: 'Agenda',
        dni: String((Date.now() % 9_000_000) + 1_000_000 + 620),
        status: 'ACTIVO',
        roleId: odontologoRole.id,
      },
    });
    createdUserIds.push(staff.id);
    staffId = staff.id;

    // Rol de prueba sin permisos → 403 en lectura y escritura.
    const emptyRole = await prisma.role.create({
      data: {
        key: `SIN_PERM_AGENDA_${Date.now()}`,
        name: 'Sin permisos de agenda (test)',
        permissions: [],
      },
    });
    noPermRoleId = emptyRole.id;
    const noPermUser = await prisma.user.create({
      data: {
        email: `noperm-agenda-${Date.now()}@example.com`,
        passwordHash,
        firstName: 'Sin',
        lastName: 'PermisosAgenda',
        dni: String((Date.now() % 9_000_000) + 1_000_000 + 621),
        status: 'ACTIVO',
        roleId: emptyRole.id,
      },
    });
    createdUserIds.push(noPermUser.id);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local' },
    });
    adminId = admin.id;

    // Paciente de prueba vía PatientsService (crea los 52 dientes).
    const patientsService = moduleRef.get(PatientsService);
    const patient = await patientsService.create(
      {
        firstName: 'Agenda',
        lastName: 'Turnos',
        dni: String((Date.now() % 9_000_000) + 1_000_000 + 622),
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
          { entityType: 'APPOINTMENT', entityId: { in: createdAppointmentIds } },
          { entityType: 'PATIENT', entityId: { in: createdPatientIds } },
          { userId: { in: createdUserIds } },
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

  function createTurno(
    body: Record<string, unknown>,
    cookie: string = staffCookie,
  ): ReturnType<typeof request> {
    return request(app.getHttpServer()).post('/appointments').set('Cookie', cookie).send(body);
  }

  async function createAndTrack(body: Record<string, unknown>): Promise<string> {
    const response = await createTurno(body);
    expect(response.status).toBe(201);
    createdAppointmentIds.push(response.body.id);
    return response.body.id as string;
  }

  it('rechaza con 401 los endpoints sin sesión', async () => {
    const list = await request(app.getHttpServer()).get('/appointments');
    expect(list.status).toBe(401);
    expect(list.body.error.code).toBe('UNAUTHORIZED');

    expect((await request(app.getHttpServer()).get('/appointments/stats')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/appointments/professionals')).status).toBe(401);
    expect((await request(app.getHttpServer()).get(`/patients/${patientId}/appointments`)).status).toBe(401);

    const create = await createTurno(
      { patientId, professionalId: staffId, date: today, time: '10:00', durationMin: 30 },
      '',
    );
    expect(create.status).toBe(401);

    const status = await request(app.getHttpServer())
      .post(`/appointments/${FAR_FUTURE_ID}/status`)
      .send({ status: 'CONFIRMADO' });
    expect(status.status).toBe(401);

    const signa = await request(app.getHttpServer())
      .post(`/appointments/${FAR_FUTURE_ID}/signa`)
      .send({ signaPaid: false });
    expect(signa.status).toBe(401);
  });

  it('responde 403 al personal sin permisos de agenda', async () => {
    const list = await request(app.getHttpServer())
      .get('/appointments')
      .set('Cookie', noPermCookie);
    expect(list.status).toBe(403);

    const stats = await request(app.getHttpServer())
      .get('/appointments/stats')
      .set('Cookie', noPermCookie);
    expect(stats.status).toBe(403);

    const create = await createTurno(
      { patientId, professionalId: staffId, date: today, time: '10:00', durationMin: 30 },
      noPermCookie,
    );
    expect(create.status).toBe(403);

    const status = await request(app.getHttpServer())
      .post(`/appointments/${FAR_FUTURE_ID}/status`)
      .set('Cookie', noPermCookie)
      .send({ status: 'CONFIRMADO' });
    expect(status.status).toBe(403);

    const byPatient = await request(app.getHttpServer())
      .get(`/patients/${patientId}/appointments`)
      .set('Cookie', noPermCookie);
    expect(byPatient.status).toBe(403);

    // El rol ADMIN hereda appointments.read del personal (debe poder leer).
    const adminList = await request(app.getHttpServer())
      .get('/appointments')
      .set('Cookie', adminCookie);
    expect(adminList.status).toBe(200);
  });

  it('crea un turno con datos completos y audita APPOINTMENT_CREATED', async () => {
    const response = await createTurno({
      patientId,
      professionalId: staffId,
      date: today,
      time: '10:00',
      durationMin: 30,
      reason: 'Control general',
      observations: 'Primera consulta',
      signaRequired: true,
      signaAmount: 15000,
    });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('PENDIENTE');
    expect(response.body.patient.id).toBe(patientId);
    expect(response.body.professional.id).toBe(staffId);
    expect(response.body.createdBy.id).toBeTruthy();
    expect(response.body.signaRequired).toBe(true);
    expect(response.body.signaAmount).toBe(15000);
    expect(response.body.signaPaid).toBe(false);
    expect(response.body.date).toBe(today);

    apptToday = response.body.id;
    createdAppointmentIds.push(apptToday);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'APPOINTMENT_CREATED', entityId: apptToday },
    });
    expect(audit).not.toBeNull();
    expect(audit?.userId).toBe(staffId);
  });

  it('valida el alta (hora inválida 400 y referencias inexistentes 404)', async () => {
    const badTime = await createTurno({
      patientId,
      professionalId: staffId,
      date: today,
      time: '99:99',
      durationMin: 30,
    });
    expect(badTime.status).toBe(400);
    expect(badTime.body.error.code).toBe('VALIDATION_ERROR');
    expect(badTime.body.error.fields.time).toBe('Ingresá una hora válida (HH:MM).');

    const badDuration = await createTurno({
      patientId,
      professionalId: staffId,
      date: today,
      time: '10:00',
      durationMin: 2,
    });
    expect(badDuration.status).toBe(400);
    expect(badDuration.body.error.fields.durationMin).toBe(
      'La duración mínima es de 5 minutos.',
    );

    const missingPatient = await createTurno({
      patientId: FAR_FUTURE_ID,
      professionalId: staffId,
      date: today,
      time: '10:00',
      durationMin: 30,
    });
    expect(missingPatient.status).toBe(404);
    expect(missingPatient.body.error.code).toBe('PATIENT_NOT_FOUND');

    const missingProfessional = await createTurno({
      patientId,
      professionalId: FAR_FUTURE_ID,
      date: today,
      time: '10:00',
      durationMin: 30,
    });
    expect(missingProfessional.status).toBe(404);
    expect(missingProfessional.body.error.code).toBe('PROFESSIONAL_NOT_FOUND');
  });

  it('lista turnos con filtros de rango, profesional y estado', async () => {
    apptEdit = await createAndTrack({
      patientId,
      professionalId: adminId,
      date: dateD1,
      time: '15:00',
      durationMin: 45,
    });
    apptSigna = await createAndTrack({
      patientId,
      professionalId: staffId,
      date: dateD1,
      time: '16:00',
      durationMin: 30,
      signaRequired: true,
    });
    apptCancel = await createAndTrack({
      patientId,
      professionalId: staffId,
      date: dateD2,
      time: '09:00',
      durationMin: 30,
    });
    apptAbsent = await createAndTrack({
      patientId,
      professionalId: adminId,
      date: dateD3,
      time: '12:00',
      durationMin: 30,
    });

    // Por defecto devuelve hoy (donde existe el turno recién creado).
    const defaultList = await request(app.getHttpServer())
      .get('/appointments')
      .set('Cookie', staffCookie);
    expect(defaultList.status).toBe(200);
    expect(defaultList.body.some((a: { id: string }) => a.id === apptToday)).toBe(true);

    const byRange = await request(app.getHttpServer())
      .get(`/appointments?from=${dateD1}&to=${dateD1}`)
      .set('Cookie', staffCookie);
    expect(byRange.status).toBe(200);
    const rangeIds = byRange.body.map((a: { id: string }) => a.id);
    expect(rangeIds).toContain(apptEdit);
    expect(rangeIds).toContain(apptSigna);
    expect(rangeIds).not.toContain(apptCancel);
    expect(rangeIds).not.toContain(apptToday);

    const byProfessional = await request(app.getHttpServer())
      .get(`/appointments?from=${dateD1}&to=${dateD3}&professionalId=${adminId}`)
      .set('Cookie', staffCookie);
    expect(byProfessional.status).toBe(200);
    const adminIds = byProfessional.body.map((a: { id: string }) => a.id);
    expect(adminIds).toContain(apptEdit);
    expect(adminIds).toContain(apptAbsent);
    expect(adminIds).not.toContain(apptSigna);

    const byStatus = await request(app.getHttpServer())
      .get(`/appointments?from=${dateD1}&to=${dateD3}&status=PENDIENTE`)
      .set('Cookie', staffCookie);
    expect(byStatus.status).toBe(200);
    expect(byStatus.body.length).toBeGreaterThanOrEqual(4);
    expect(
      byStatus.body.every((a: { status: string }) => a.status === 'PENDIENTE'),
    ).toBe(true);

    const invertedRange = await request(app.getHttpServer())
      .get(`/appointments?from=${dateD3}&to=${dateD1}`)
      .set('Cookie', staffCookie);
    expect(invertedRange.status).toBe(400);
    expect(invertedRange.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve el detalle con historial vacío y 404/400 para ids inválidos', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/appointments/${apptToday}`)
      .set('Cookie', staffCookie);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(apptToday);
    expect(detail.body.events).toEqual([]);
    expect(detail.body.reason).toBe('Control general');

    const unknown = await request(app.getHttpServer())
      .get(`/appointments/${FAR_FUTURE_ID}`)
      .set('Cookie', staffCookie);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('APPOINTMENT_NOT_FOUND');

    const invalidId = await request(app.getHttpServer())
      .get('/appointments/no-es-uuid')
      .set('Cookie', staffCookie);
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe('INVALID_ID');
  });

  it('recorre la máquina de estados hasta ATENDIDO con eventos en el historial', async () => {
    const steps: Array<{ to: string; from: string | null }> = [
      { to: 'CONFIRMADO', from: 'PENDIENTE' },
      { to: 'PRESENTE', from: 'CONFIRMADO' },
      { to: 'EN_ATENCION', from: 'PRESENTE' },
      { to: 'ATENDIDO', from: 'EN_ATENCION' },
    ];
    for (const step of steps) {
      const response = await request(app.getHttpServer())
        .post(`/appointments/${apptToday}/status`)
        .set('Cookie', staffCookie)
        .send({ status: step.to });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe(step.to);
    }

    const detail = await request(app.getHttpServer())
      .get(`/appointments/${apptToday}`)
      .set('Cookie', staffCookie);
    expect(detail.body.events).toHaveLength(4);
    const pairs = detail.body.events.map(
      (event: { fromStatus: string | null; toStatus: string }) =>
        `${event.fromStatus}->${event.toStatus}`,
    );
    expect(pairs).toEqual(
      expect.arrayContaining([
        'PENDIENTE->CONFIRMADO',
        'CONFIRMADO->PRESENTE',
        'PRESENTE->EN_ATENCION',
        'EN_ATENCION->ATENDIDO',
      ]),
    );
    expect(
      detail.body.events.every(
        (event: { createdBy: { id: string } }) => event.createdBy.id === staffId,
      ),
    ).toBe(true);

    const audits = await prisma.auditLog.findMany({
      where: { action: 'APPOINTMENT_STATUS_CHANGED', entityId: apptToday },
    });
    expect(audits).toHaveLength(4);
    expect(
      audits.some((row) => JSON.stringify(row.metadata).includes('"to":"CONFIRMADO"')),
    ).toBe(true);
  });

  it('rechaza transiciones inválidas con 409 INVALID_TRANSITION', async () => {
    // Directo de PENDIENTE a ATENDIDO (salta pasos).
    const jump = await request(app.getHttpServer())
      .post(`/appointments/${apptCancel}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'ATENDIDO' });
    expect(jump.status).toBe(409);
    expect(jump.body.error.code).toBe('INVALID_TRANSITION');
    expect(jump.body.error.message).toContain('Pendiente');

    // Mismo estado (sin cambio efectivo).
    const same = await request(app.getHttpServer())
      .post(`/appointments/${apptCancel}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'PENDIENTE' });
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe('INVALID_TRANSITION');

    // Estado cerrado (ATENDIDO) no tiene salidas (con motivo válido para
    // alcanzar la regla de transición; sin motivo rechazaría el validador 400).
    const closed = await request(app.getHttpServer())
      .post(`/appointments/${apptToday}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'CANCELADO', reason: 'Intento sobre turno cerrado' });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('INVALID_TRANSITION');

    // El turno cerrado tampoco admite edición ni seña.
    const patchClosed = await request(app.getHttpServer())
      .patch(`/appointments/${apptToday}`)
      .set('Cookie', staffCookie)
      .send({ time: '11:00' });
    expect(patchClosed.status).toBe(409);
    expect(patchClosed.body.error.code).toBe('APPOINTMENT_CLOSED');

    const signaClosed = await request(app.getHttpServer())
      .post(`/appointments/${apptToday}/signa`)
      .set('Cookie', staffCookie)
      .send({ signaPaid: false });
    expect(signaClosed.status).toBe(409);
    expect(signaClosed.body.error.code).toBe('APPOINTMENT_CLOSED');
  });

  it('cancela un turno exigiendo motivo y audita APPOINTMENT_CANCELLED', async () => {
    const withoutReason = await request(app.getHttpServer())
      .post(`/appointments/${apptCancel}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'CANCELADO' });
    expect(withoutReason.status).toBe(400);
    expect(withoutReason.body.error.code).toBe('VALIDATION_ERROR');
    expect(withoutReason.body.error.fields.reason).toBe(
      'El motivo es obligatorio para cancelar, marcar ausente o reprogramar un turno.',
    );

    const cancelled = await request(app.getHttpServer())
      .post(`/appointments/${apptCancel}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'CANCELADO', reason: 'El paciente avisó por teléfono' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELADO');
    expect(cancelled.body.cancelReason).toBe('El paciente avisó por teléfono');
    expect(cancelled.body.cancelledAt).toBeTruthy();
    expect(cancelled.body.cancelledBy.id).toBe(staffId);
    expect(cancelled.body.events[0]).toMatchObject({
      fromStatus: 'PENDIENTE',
      toStatus: 'CANCELADO',
      reason: 'El paciente avisó por teléfono',
    });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'APPOINTMENT_CANCELLED', entityId: apptCancel },
    });
    expect(audit).not.toBeNull();
    // La auditoría no guarda texto libre del usuario (queda en el turno/evento).
    expect(JSON.stringify(audit?.metadata)).not.toContain('teléfono');
  });

  it('registra ausencia con motivo y audita APPOINTMENT_ABSENT_REGISTERED', async () => {
    const response = await request(app.getHttpServer())
      .post(`/appointments/${apptAbsent}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'AUSENTE', reason: 'No se presentó' });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('AUSENTE');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'APPOINTMENT_ABSENT_REGISTERED', entityId: apptAbsent },
    });
    expect(audit).not.toBeNull();
  });

  it('edita campos operativos sin tocar paciente ni estado', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/appointments/${apptEdit}`)
      .set('Cookie', staffCookie)
      .send({
        patientId: FAR_FUTURE_ID, // se ignora: el paciente de un turno no se cambia
        time: '15:30',
        durationMin: 60,
        reason: 'Movido a última hora',
        observations: 'El paciente pidió reprogramar la hora',
      });
    expect(response.status).toBe(200);
    expect(response.body.time).toBe('15:30');
    expect(response.body.durationMin).toBe(60);
    expect(response.body.reason).toBe('Movido a última hora');
    expect(response.body.patientId).toBe(patientId);
    expect(response.body.status).toBe('PENDIENTE');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'APPOINTMENT_UPDATED', entityId: apptEdit },
    });
    expect(audit).not.toBeNull();

    // Sin campos editables → 400.
    const empty = await request(app.getHttpServer())
      .patch(`/appointments/${apptEdit}`)
      .set('Cookie', staffCookie)
      .send({});
    expect(empty.status).toBe(400);
    expect(empty.body.error.fields.form).toBe('Enviá al menos un campo para modificar.');

    // Profesional inexistente → 404.
    const badProfessional = await request(app.getHttpServer())
      .patch(`/appointments/${apptEdit}`)
      .set('Cookie', staffCookie)
      .send({ professionalId: FAR_FUTURE_ID });
    expect(badProfessional.status).toBe(404);
    expect(badProfessional.body.error.code).toBe('PROFESSIONAL_NOT_FOUND');

    // Turno inexistente → 404.
    const missing = await request(app.getHttpServer())
      .patch(`/appointments/${FAR_FUTURE_ID}`)
      .set('Cookie', staffCookie)
      .send({ time: '10:00' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('APPOINTMENT_NOT_FOUND');
  });

  it('registra la seña completa, la anula y audita SIGNA_REGISTERED (CU-14)', async () => {
    const incomplete = await request(app.getHttpServer())
      .post(`/appointments/${apptSigna}/signa`)
      .set('Cookie', staffCookie)
      .send({ signaPaid: true, signaReceived: 15000 });
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.error.code).toBe('VALIDATION_ERROR');

    const paid = await request(app.getHttpServer())
      .post(`/appointments/${apptSigna}/signa`)
      .set('Cookie', staffCookie)
      .send({
        signaPaid: true,
        signaReceived: 15000,
        signaDate: today,
        signaMethod: 'EFECTIVO',
        signaNotes: 'Seña en efectivo en recepción',
      });
    expect(paid.status).toBe(200);
    expect(paid.body.signaPaid).toBe(true);
    expect(paid.body.signaReceived).toBe(15000);
    expect(paid.body.signaDate).toBe(today);
    expect(paid.body.signaMethod).toBe('EFECTIVO');
    // La seña no cambia el estado del turno (eso tiene endpoint propio).
    expect(paid.body.status).toBe('PENDIENTE');

    const signaAudits = await prisma.auditLog.findMany({
      where: { action: 'SIGNA_REGISTERED', entityId: apptSigna },
    });
    expect(
      signaAudits.some(
        (row) =>
          row.userId === staffId &&
          JSON.stringify(row.metadata).includes('"received":15000'),
      ),
    ).toBe(true);

    const unpaid = await request(app.getHttpServer())
      .post(`/appointments/${apptSigna}/signa`)
      .set('Cookie', staffCookie)
      .send({ signaPaid: false });
    expect(unpaid.status).toBe(200);
    expect(unpaid.body.signaPaid).toBe(false);
    expect(unpaid.body.signaReceived).toBeNull();
    expect(unpaid.body.signaDate).toBeNull();
    expect(unpaid.body.signaMethod).toBeNull();
    // El monto requerido (signaRequired/signaAmount) no se toca.
    expect(unpaid.body.signaRequired).toBe(true);
  });

  it('devuelve los profesionales activos (usuarios habilitados)', async () => {
    const response = await request(app.getHttpServer())
      .get('/appointments/professionals')
      .set('Cookie', staffCookie);
    expect(response.status).toBe(200);
    const staffRow = response.body.find((p: { id: string }) => p.id === staffId);
    expect(staffRow).toMatchObject({
      firstName: 'Profesional',
      lastName: 'Agenda',
      roleKey: 'ODONTOLOGO',
    });
    expect(response.body.some((p: { id: string }) => p.id === adminId)).toBe(true);
  });

  it('lista los turnos de la ficha del paciente (más recientes primero)', async () => {
    const response = await request(app.getHttpServer())
      .get(`/patients/${patientId}/appointments`)
      .set('Cookie', staffCookie);
    expect(response.status).toBe(200);
    const ids = response.body.map((a: { id: string }) => a.id);
    for (const id of [apptToday, apptCancel, apptAbsent, apptEdit, apptSigna]) {
      expect(ids).toContain(id);
    }
    // dateD3 (apptAbsent) es la fecha más lejana creada → va primero.
    expect(response.body[0].id).toBe(apptAbsent);

    const unknownPatient = await request(app.getHttpServer())
      .get(`/patients/${FAR_FUTURE_ID}/appointments`)
      .set('Cookie', staffCookie);
    expect(unknownPatient.status).toBe(404);
    expect(unknownPatient.body.error.code).toBe('PATIENT_NOT_FOUND');
  });

  it('devuelve estadísticas del dashboard (hoy, próximos y por estado)', async () => {
    const response = await request(app.getHttpServer())
      .get('/appointments/stats')
      .set('Cookie', staffCookie);
    expect(response.status).toBe(200);
    expect(response.body.date).toBe(today);
    expect(response.body.today).toBeGreaterThanOrEqual(1);
    expect(response.body.upcoming).toBeGreaterThanOrEqual(2);
    expect(Object.keys(response.body.byStatus)).toHaveLength(9);
    expect(response.body.byStatus.ATENDIDO).toBeGreaterThanOrEqual(1);
    expect(response.body.byStatus.CANCELADO).toBeGreaterThanOrEqual(1);
    expect(response.body.byStatus.AUSENTE).toBeGreaterThanOrEqual(1);

    const byDate = await request(app.getHttpServer())
      .get(`/appointments/stats?date=${dateD1}`)
      .set('Cookie', staffCookie);
    expect(byDate.status).toBe(200);
    expect(byDate.body.date).toBe(dateD1);
    expect(byDate.body.today).toBe(2); // apptEdit + apptSigna en dateD1
  });
});
