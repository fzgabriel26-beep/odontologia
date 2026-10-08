import { Controller, Get, Query } from '@nestjs/common';
import type { AuditQueryInput } from '@odonto/validation';
import { auditQuerySchema } from '@odonto/validation';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditService, type AuditEntryView } from './audit.service';

/**
 * Panel de auditoría (SDD CU-15 / fase 9): solo lectura (el registro es
 * insert-only, sin POST/PATCH/DELETE). Requiere `audit.read`
 * (solo rol ADMIN en el MVP).
 */
@Controller('audit')
@RequirePermission('audit.read')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /** Historial con filtros: acción, usuario, paciente, fechas y paginación. */
  @Get()
  list(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryInput,
  ): Promise<AuditEntryView[]> {
    return this.auditService.list(query);
  }
}
