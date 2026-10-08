import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  APPOINTMENT_CLOSED_STATUSES,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  canTransitionAppointment,
  type AppointmentStatus,
  type PaymentMethod,
} from '@odonto/types';
import type {
  AppointmentListQueryInput,
  AppointmentStatsQueryInput,
  ChangeAppointmentStatusInput,
  CreateAppointmentInput,
  RegisterSignaInput,
  UpdateAppointmentInput,
} from '@odonto/validation';
import { AuditService } from '../audit/audit.service';
import type { Appointment } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Ejecutor de la acción (para auditoría). */
export interface AppointmentActor {
  id: string;
  ip?: string;
}

export interface AppointmentUserRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface AppointmentPatientRef extends AppointmentUserRef {
  dni: string;
}

export interface AppointmentEventView {
  id: string;
  appointmentId: string;
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus;
  reason: string | null;
  createdById: string;
  createdBy: AppointmentUserRef;
  createdAt: string;
}

/** Turno serializado a JSON (fechas ISO, decimales como número, sin Decimal de Prisma). */
export interface AppointmentView {
  id: string;
  patientId: string;
  patient: AppointmentPatientRef;
  professionalId: string;
  professional: AppointmentUserRef;
  date: string;
  time: string;
  durationMin: number;
  reason: string | null;
  status: AppointmentStatus;
  observations: string | null;
  signaRequired: boolean;
  signaAmount: number | null;
  signaPaid: boolean;
  signaReceived: number | null;
  signaDate: string | null;
  signaMethod: PaymentMethod | null;
  signaNotes: string | null;
  cancelledAt: string | null;
  cancelledBy: AppointmentUserRef | null;
  cancelReason: string | null;
  createdById: string;
  createdBy: AppointmentUserRef;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentDetailView extends AppointmentView {
  /** Historial de transiciones, más reciente primero (nunca se borra). */
  events: AppointmentEventView[];
}

export interface AppointmentStatsView {
  date: string;
  today: number;
  upcoming: number;
  byStatus: Record<AppointmentStatus, number>;
}

export interface ProfessionalView {
  id: string;
  firstName: string;
  lastName: string;
  roleKey: string;
}

type AppointmentRow = Appointment & {
  patient: AppointmentPatientRef;
  professional: AppointmentUserRef;
  createdBy: AppointmentUserRef;
  cancelledBy: AppointmentUserRef | null;
};

const USER_MIN = { id: true, firstName: true, lastName: true } as const;

const APPOINTMENT_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true, dni: true } },
  professional: { select: USER_MIN },
  createdBy: { select: USER_MIN },
  cancelledBy: { select: USER_MIN },
} as const;

/** '' o null → null; undefined → no tocar el campo (Prisma lo ignora). */
function toDbText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === '' ? null : value;
}

/** Fecha aaaa-mm-dd (UTC) desde un Date de columna @db.Date. */
function dateOnlyIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** aaaa-mm-dd → Date UTC a medianoche (como almacena Prisma @db.Date). */
function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toView(row: AppointmentRow): AppointmentView {
  return {
    id: row.id,
    patientId: row.patientId,
    patient: row.patient,
    professionalId: row.professionalId,
    professional: row.professional,
    date: dateOnlyIso(row.date),
    time: row.time,
    durationMin: row.durationMin,
    reason: row.reason,
    status: row.status,
    observations: row.observations,
    signaRequired: row.signaRequired,
    signaAmount: row.signaAmount === null ? null : Number(row.signaAmount),
    signaPaid: row.signaPaid,
    signaReceived: row.signaReceived === null ? null : Number(row.signaReceived),
    signaDate: row.signaDate === null ? null : dateOnlyIso(row.signaDate),
    signaMethod: row.signaMethod,
    signaNotes: row.signaNotes,
    cancelledAt: row.cancelledAt === null ? null : row.cancelledAt.toISOString(),
    cancelledBy: row.cancelledBy,
    cancelReason: row.cancelReason,
    createdById: row.createdById,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toEventView(event: {
  id: string;
  appointmentId: string;
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus;
  reason: string | null;
  createdById: string;
  createdBy: AppointmentUserRef;
  createdAt: Date;
}): AppointmentEventView {
  return { ...event, createdAt: event.createdAt.toISOString() };
}

/**
 * Agenda de turnos (SDD, fase 8 / CU-12 a CU-14): alta, edición, máquina de
 * estados con motivo obligatorio en cancelación/ausencia/reprogramación, seña
 * y estadísticas. Los turnos nunca se borran: solo cambian de estado
 * (§5.4 ineliminables) y cada transición deja un AppointmentEvent inmutable.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async findPatientOrFail(patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException({
        error: {
          code: 'PATIENT_NOT_FOUND',
          message: 'No existe un paciente con ese identificador.',
        },
      });
    }
  }

  private async findProfessionalOrFail(professionalId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: professionalId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException({
        error: {
          code: 'PROFESSIONAL_NOT_FOUND',
          message: 'No existe un profesional con ese identificador.',
        },
      });
    }
  }

  private async findOrFail(id: string): Promise<AppointmentRow> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appointment) {
      throw new NotFoundException({
        error: {
          code: 'APPOINTMENT_NOT_FOUND',
          message: 'No existe un turno con ese identificador.',
        },
      });
    }
    return appointment;
  }

  private assertOpen(appointment: AppointmentRow): void {
    if (APPOINTMENT_CLOSED_STATUSES.includes(appointment.status)) {
      throw new ConflictException({
        error: {
          code: 'APPOINTMENT_CLOSED',
          message:
            'El turno está cerrado (atendido, cancelado, ausente o reprogramado) y no admite cambios.',
        },
      });
    }
  }

  /** Turnos del rango (por defecto, hoy), ordenados por fecha y hora. */
  async list(query: AppointmentListQueryInput): Promise<AppointmentView[]> {
    const today = dateOnlyIso(new Date());
    const from = query.from ?? today;
    const to = query.to ?? from;
    const rows = await this.prisma.appointment.findMany({
      where: {
        date: { gte: dateFromIso(from), lte: dateFromIso(to) },
        ...(query.professionalId ? { professionalId: query.professionalId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      include: APPOINTMENT_INCLUDE,
    });
    return rows.map(toView);
  }

  /** Detalle de un turno con su historial de transiciones. */
  async get(id: string): Promise<AppointmentDetailView> {
    const row = await this.findOrFail(id);
    const events = await this.prisma.appointmentEvent.findMany({
      where: { appointmentId: id },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: USER_MIN } },
    });
    return { ...toView(row), events: events.map(toEventView) };
  }

  /** Usuarios activos que pueden ser asignados como profesional del turno. */
  async professionals(): Promise<ProfessionalView[]> {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVO' },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, role: { select: { key: true } } },
    });
    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      roleKey: user.role.key,
    }));
  }

  async create(input: CreateAppointmentInput, actor: AppointmentActor): Promise<AppointmentView> {
    await this.findPatientOrFail(input.patientId);
    await this.findProfessionalOrFail(input.professionalId);

    const row = await this.prisma.appointment.create({
      data: {
        patientId: input.patientId,
        professionalId: input.professionalId,
        date: dateFromIso(input.date),
        time: input.time,
        durationMin: input.durationMin,
        reason: toDbText(input.reason) ?? null,
        observations: toDbText(input.observations) ?? null,
        signaRequired: input.signaRequired ?? false,
        signaAmount: input.signaAmount ?? null,
        status: 'PENDIENTE',
        createdById: actor.id,
      },
      include: APPOINTMENT_INCLUDE,
    });

    // Auditoría sin texto libre del usuario (el motivo viaja en el turno/evento).
    await this.audit.log({
      userId: actor.id,
      action: 'APPOINTMENT_CREATED',
      entityType: 'APPOINTMENT',
      entityId: row.id,
      metadata: {
        patientId: row.patientId,
        professionalId: row.professionalId,
        date: input.date,
        time: input.time,
      },
      ip: actor.ip,
    });
    return toView(row);
  }

  /** Edición de datos operativos de un turno abierto (el estado tiene endpoint propio). */
  async update(
    id: string,
    input: UpdateAppointmentInput,
    actor: AppointmentActor,
  ): Promise<AppointmentView> {
    const current = await this.findOrFail(id);
    this.assertOpen(current);
    if (input.professionalId !== undefined) {
      await this.findProfessionalOrFail(input.professionalId);
    }

    const data: {
      date?: Date;
      time?: string;
      durationMin?: number;
      reason?: string | null;
      observations?: string | null;
      professionalId?: string;
      signaRequired?: boolean;
      signaAmount?: number | null;
    } = {};
    if (input.date !== undefined) data.date = dateFromIso(input.date);
    if (input.time !== undefined) data.time = input.time;
    if (input.durationMin !== undefined) data.durationMin = input.durationMin;
    if (input.reason !== undefined) data.reason = toDbText(input.reason) ?? null;
    if (input.observations !== undefined) data.observations = toDbText(input.observations) ?? null;
    if (input.professionalId !== undefined) data.professionalId = input.professionalId;
    if (input.signaRequired !== undefined) data.signaRequired = input.signaRequired;
    if (input.signaAmount !== undefined) data.signaAmount = input.signaAmount;

    const updated = await this.prisma.appointment.update({
      where: { id },
      data,
      include: APPOINTMENT_INCLUDE,
    });

    await this.audit.log({
      userId: actor.id,
      action: 'APPOINTMENT_UPDATED',
      entityType: 'APPOINTMENT',
      entityId: id,
      // Solo nombres de campos (sin valores del usuario ni datos sensibles).
      metadata: {
        fields: Object.keys(data),
        patientId: current.patientId,
        from: current.status,
      },
      ip: actor.ip,
    });
    return toView(updated);
  }

  /**
   * Transición de estado (CU-13): la tabla de transiciones vive en el backend;
   * todo cambio deja un AppointmentEvent con motivo (obligatorio en
   * CANCELADO/AUSENTE/REPROGRAMADO, exigido por el schema) y una auditoría.
   */
  async changeStatus(
    id: string,
    input: ChangeAppointmentStatusInput,
    actor: AppointmentActor,
  ): Promise<AppointmentDetailView> {
    const current = await this.findOrFail(id);
    if (!canTransitionAppointment(current.status, input.status)) {
      throw new ConflictException({
        error: {
          code: 'INVALID_TRANSITION',
          message: `No se puede pasar de "${APPOINTMENT_STATUS_LABELS[current.status]}" a "${APPOINTMENT_STATUS_LABELS[input.status]}".`,
        },
      });
    }

    const reason = input.reason ?? null;
    await this.prisma.$transaction([
      this.prisma.appointment.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.status === 'CANCELADO'
            ? { cancelledAt: new Date(), cancelledById: actor.id, cancelReason: reason }
            : {}),
        },
        include: APPOINTMENT_INCLUDE,
      }),
      this.prisma.appointmentEvent.create({
        data: {
          appointmentId: id,
          fromStatus: current.status,
          toStatus: input.status,
          reason,
          createdById: actor.id,
        },
      }),
    ]);

    // Cancelación y ausencia se contabilizan por separado (§5.4).
    const action =
      input.status === 'CANCELADO'
        ? 'APPOINTMENT_CANCELLED'
        : input.status === 'AUSENTE'
          ? 'APPOINTMENT_ABSENT_REGISTERED'
          : 'APPOINTMENT_STATUS_CHANGED';
    await this.audit.log({
      userId: actor.id,
      action,
      entityType: 'APPOINTMENT',
      entityId: id,
      metadata: {
        patientId: current.patientId,
        from: current.status,
        to: input.status,
        date: dateOnlyIso(current.date),
        time: current.time,
      },
      ip: actor.ip,
    });
    return this.get(id);
  }

  /** Registro/anulación de la seña (CU-14); no cambia el estado del turno. */
  async registerSigna(
    id: string,
    input: RegisterSignaInput,
    actor: AppointmentActor,
  ): Promise<AppointmentView> {
    const current = await this.findOrFail(id);
    this.assertOpen(current);

    const data = input.signaPaid
      ? {
          signaPaid: true,
          signaReceived: input.signaReceived ?? null,
          signaDate: input.signaDate ? dateFromIso(input.signaDate) : null,
          signaMethod: input.signaMethod ?? null,
          signaNotes: toDbText(input.signaNotes) ?? null,
        }
      : {
          // Anular la seña deja los datos de pago en blanco (queda auditado).
          signaPaid: false,
          signaReceived: null,
          signaDate: null,
          signaMethod: null,
          signaNotes: null,
        };

    const updated = await this.prisma.appointment.update({
      where: { id },
      data,
      include: APPOINTMENT_INCLUDE,
    });

    await this.audit.log({
      userId: actor.id,
      action: 'SIGNA_REGISTERED',
      entityType: 'APPOINTMENT',
      entityId: id,
      metadata: {
        patientId: current.patientId,
        paid: input.signaPaid,
        ...(input.signaPaid
          ? { received: input.signaReceived, method: input.signaMethod }
          : {}),
      },
      ip: actor.ip,
    });
    return toView(updated);
  }

  /** Todos los turnos de un paciente (incluye cerrados), más recientes primero. */
  async byPatient(patientId: string): Promise<AppointmentView[]> {
    await this.findPatientOrFail(patientId);
    const rows = await this.prisma.appointment.findMany({
      where: { patientId },
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
      include: APPOINTMENT_INCLUDE,
    });
    return rows.map(toView);
  }

  /** Indicadores del dashboard: turno de hoy, próximos y conteos por estado. */
  async stats(query: AppointmentStatsQueryInput): Promise<AppointmentStatsView> {
    const date = query.date ?? dateOnlyIso(new Date());
    const day = dateFromIso(date);

    const [today, upcoming, groups] = await Promise.all([
      this.prisma.appointment.count({ where: { date: day } }),
      this.prisma.appointment.count({
        where: { date: { gte: day }, status: { notIn: [...APPOINTMENT_CLOSED_STATUSES] } },
      }),
      this.prisma.appointment.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const byStatus = {} as Record<AppointmentStatus, number>;
    for (const status of APPOINTMENT_STATUSES) byStatus[status] = 0;
    for (const group of groups) byStatus[group.status] = group._count._all;

    return { date, today, upcoming, byStatus };
  }
}
