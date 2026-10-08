import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction } from '@odonto/types';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditInput {
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  /** Solo datos no sensibles (ids, motivos, emails). Nunca información clínica ni contraseñas. */
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

/**
 * Registro de auditoría (SDD §10): insert-only sobre AuditLog.
 * Un fallo de auditoría no debe tumbar la operación principal; se loguea igual.
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
    } catch {
      this.logger.error(`No se pudo registrar la auditoría: ${input.action}`);
    }
  }
}
