import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction } from '@odonto/types';
import type { AuditQueryInput } from '@odonto/validation';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { markAuditLogged } from './audit-context';

export interface AuditInput {
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  /** Solo datos no sensibles (ids, motivos, emails). Nunca información clínica ni contraseñas. */
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Fila del historial de auditoría (fase 9) con los nombres del autor. */
export interface AuditEntryView {
  id: string;
  userId: string | null;
  user: { id: string; firstName: string; lastName: string } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  /** Metadatos no sensibles; null si la fila no los tiene (o no son un objeto). */
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

const DEFAULT_LIMIT = 50;

function startOfUtcDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfUtcDay(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

function isPlainObject(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Registro de auditoría (SDD §10): insert-only sobre AuditLog.
 * Un fallo de auditoría no debe tumbar la operación principal; se loguea igual.
 * `log()` además marca el estado de la request (ADR-014) para que el
 * `AuditInterceptor` no escriba su fila `API_MUTATION` de respaldo.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: input.userId ?? null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          metadata: input.metadata ?? undefined,
          ip: input.ip ?? null,
        },
      });
      markAuditLogged();
    } catch {
      this.logger.error(`No se pudo registrar la auditoría: ${input.action}`);
    }
  }

  /**
   * Listado para el panel (CU-15 / fase 9): filtros por acción, usuario,
   * paciente (entidad o metadata.patientId), rango de fechas y paginación.
   * Más recientes primero; nunca devuelve datos clínicos.
   */
  async list(query: AuditQueryInput): Promise<AuditEntryView[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: this.buildWhere(query),
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? DEFAULT_LIMIT,
      skip: query.offset ?? 0,
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      user: row.user
        ? { id: row.user.id, firstName: row.user.firstName, lastName: row.user.lastName }
        : null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: isPlainObject(row.metadata) ? row.metadata : null,
      ip: row.ip,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Filtro combinado (AND): los criterios de paciente usan OR entre entidad y metadata. */
  private buildWhere(query: AuditQueryInput): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action !== undefined) where.action = query.action;
    if (query.userId !== undefined) where.userId = query.userId;
    if (query.patientId !== undefined) {
      where.OR = [
        { entityType: 'PATIENT', entityId: query.patientId },
        { metadata: { path: ['patientId'], equals: query.patientId } },
      ];
    }
    if (query.from !== undefined || query.to !== undefined) {
      where.createdAt = {
        ...(query.from !== undefined ? { gte: startOfUtcDay(query.from) } : {}),
        ...(query.to !== undefined ? { lte: endOfUtcDay(query.to) } : {}),
      };
    }
    return where;
  }
}
