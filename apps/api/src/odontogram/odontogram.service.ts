import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateToothEventInput, UpdateToothInput } from '@odonto/validation';
import { AuditService } from '../audit/audit.service';
import type { Tooth, ToothEvent } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Ejecutor de la acción (para auditoría). */
export interface OdontogramActor {
  id: string;
  ip?: string;
}

/** Evento dental con el autor visible (SDD, fase 6). */
export type ToothEventWithAuthor = ToothEvent & {
  createdBy: { id: string; firstName: string; lastName: string };
};

const AUTHOR_SELECT = { id: true, firstName: true, lastName: true } as const;

/** '' o null → null; undefined → no tocar el campo (Prisma lo ignora). */
function toDbText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === '' ? null : value;
}

/** Fecha local de hoy como Date date-only (medianoche UTC) para @db.Date. */
function localTodayDate(): Date {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return new Date(`${year}-${month}-${day}`);
}

/**
 * Odontograma (SDD, fase 6 / CU-09): los 52 dientes FDI del paciente, historial
 * de eventos por diente y registro de eventos que actualizan el estado actual.
 * Los eventos nunca se borran (insert-only) y toda mutación queda auditada.
 */
@Injectable()
export class OdontogramService {
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

  private async findToothOrFail(toothId: string): Promise<Tooth> {
    const tooth = await this.prisma.tooth.findUnique({ where: { id: toothId } });
    if (!tooth) {
      throw new NotFoundException({
        error: {
          code: 'TOOTH_NOT_FOUND',
          message: 'No existe un diente con ese identificador.',
        },
      });
    }
    return tooth;
  }

  /** Los 52 dientes del paciente ordenados por número FDI (11 → 48 / 51 → 85). */
  async listTeeth(patientId: string): Promise<Tooth[]> {
    await this.findPatientOrFail(patientId);
    return this.prisma.tooth.findMany({
      where: { patientId },
      orderBy: { fdiNumber: 'asc' },
    });
  }

  /** Historial de eventos de un diente: más recientes primero, con autor. */
  async listEvents(toothId: string): Promise<ToothEventWithAuthor[]> {
    await this.findToothOrFail(toothId);
    return this.prisma.toothEvent.findMany({
      where: { toothId },
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
      include: { createdBy: { select: AUTHOR_SELECT } },
    });
  }

  /**
   * Registra un evento (CU-09) y actualiza `currentStatus` del diente en la
   * misma transacción. Auditoría: TOOTH_EVENT_CREATED + ODONTOGRAM_UPDATED.
   */
  async createEvent(
    toothId: string,
    input: CreateToothEventInput,
    actor: OdontogramActor,
  ): Promise<ToothEventWithAuthor> {
    const tooth = await this.findToothOrFail(toothId);

    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.toothEvent.create({
        data: {
          toothId,
          status: input.status,
          note: toDbText(input.note),
          eventDate: input.eventDate ? new Date(input.eventDate) : localTodayDate(),
          createdById: actor.id,
        },
        include: { createdBy: { select: AUTHOR_SELECT } },
      });
      await tx.tooth.update({
        where: { id: toothId },
        data: { currentStatus: input.status },
      });
      return created;
    });

    // Dos mutaciones sensibles = dos asientos de auditoría (SDD §7/§4).
    // El metadata no incluye la nota libre (sin clínica sensible en auditoría).
    await this.audit.log({
      userId: actor.id,
      action: 'TOOTH_EVENT_CREATED',
      entityType: 'TOOTH_EVENT',
      entityId: event.id,
      metadata: { toothId, fdiNumber: tooth.fdiNumber, status: input.status },
      ip: actor.ip,
    });
    await this.audit.log({
      userId: actor.id,
      action: 'ODONTOGRAM_UPDATED',
      entityType: 'TOOTH',
      entityId: toothId,
      metadata: { fdiNumber: tooth.fdiNumber, status: input.status },
      ip: actor.ip,
    });
    return event;
  }

  /** Observaciones del diente (panel lateral del odontograma). */
  async updateTooth(
    toothId: string,
    input: UpdateToothInput,
    actor: OdontogramActor,
  ): Promise<Tooth> {
    const tooth = await this.findToothOrFail(toothId);
    if (input.observations === undefined) {
      throw new BadRequestException({
        error: { code: 'NOTHING_TO_UPDATE', message: 'No hay datos para actualizar.' },
      });
    }

    const updated = await this.prisma.tooth.update({
      where: { id: toothId },
      data: { observations: toDbText(input.observations) },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'ODONTOGRAM_UPDATED',
      entityType: 'TOOTH',
      entityId: toothId,
      metadata: { fdiNumber: tooth.fdiNumber, fields: ['observations'] },
      ip: actor.ip,
    });
    return updated;
  }
}
