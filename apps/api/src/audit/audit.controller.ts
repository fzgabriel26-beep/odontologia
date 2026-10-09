import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AUDIT_ACTIONS } from '@odonto/types';
import type { AuditQueryInput } from '@odonto/validation';
import { auditQuerySchema } from '@odonto/validation';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { auditEntrySchema } from '../swagger/response-schemas';
import { arrayOf } from '../swagger/zod-schema';
import { AuditService, type AuditEntryView } from './audit.service';

/**
 * Panel de auditoría (SDD CU-15 / fase 9): solo lectura (el registro es
 * insert-only, sin POST/PATCH/DELETE). Requiere `audit.read`
 * (solo rol ADMIN en el MVP).
 */
@ApiTags('Auditoría')
@ApiSecurity('sessionCookie')
@Controller('audit')
@RequirePermission('audit.read')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /** Historial con filtros: acción, usuario, paciente, fechas y paginación. */
  @Get()
  @ApiOperation({
    summary: 'Consultar el historial de auditoría',
    description:
      'Registro insert-only: nunca se modifica ni elimina (SDD §10). Filtra por acción, ' +
      'usuario, paciente y rango de fechas (desde/hasta) con paginación limit 1-500 ' +
      '(por defecto 50). Requiere `audit.read`.',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    type: 'string',
    enum: [...AUDIT_ACTIONS],
    description: 'Acción de auditoría a filtrar.',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: 'string',
    format: 'uuid',
    description: 'UUID del usuario autor de la acción.',
  })
  @ApiQuery({
    name: 'patientId',
    required: false,
    type: 'string',
    format: 'uuid',
    description: 'UUID del paciente afectado.',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: 'string',
    format: 'date',
    description: 'Fecha desde (YYYY-MM-DD, inclusive).',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: 'string',
    format: 'date',
    description: 'Fecha hasta (YYYY-MM-DD, inclusive).',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'integer',
    description: 'Máximo de filas a devolver (1-500; por defecto 50).',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: 'integer',
    description: 'Desplazamiento para paginar.',
  })
  @ApiOkResponse({ description: 'Entradas de auditoría.', schema: arrayOf(auditEntrySchema) })
  list(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryInput,
  ): Promise<AuditEntryView[]> {
    return this.auditService.list(query);
  }
}
