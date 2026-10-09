import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import type { CreateClinicalRecordInput } from '@odonto/validation';
import { createClinicalRecordSchema } from '@odonto/validation';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { clinicalRecordSchema } from '../swagger/response-schemas';
import { arrayOf, zodToSchema } from '../swagger/zod-schema';
import {
  ClinicalRecordsService,
  type ClinicalRecordActor,
  type ClinicalRecordWithAuthor,
} from './clinical-records.service';

interface RequestWithIp {
  ip?: string;
}

function actorOf(user: AuthUser, req: RequestWithIp): ClinicalRecordActor {
  return { id: user.id, ip: req.ip };
}

/**
 * Vista real de `ClinicalRecordWithAuthor`: el schema compartido más el
 * escalar `createdById` que Prisma devuelve junto al autor incluido.
 */
const clinicalRecordViewSchema: SchemaObject = {
  ...clinicalRecordSchema,
  properties: {
    ...clinicalRecordSchema.properties,
    createdById: { type: 'string', format: 'uuid' },
  },
};

/**
 * Historia clínica (SDD CU-08): consulta y alta de evoluciones por paciente.
 * Requiere `clinical.read` para lectura y `clinical.write` para mutaciones.
 */
@ApiTags('Historia clínica')
@ApiSecurity('sessionCookie')
@Controller('patients/:id/records')
@RequirePermission('clinical.read')
export class ClinicalRecordsController {
  constructor(private readonly clinicalRecordsService: ClinicalRecordsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar evoluciones de un paciente',
    description:
      'Devuelve las evoluciones no archivadas, más recientes primero, con el autor de cada una. ' +
      'Requiere el permiso `clinical.read`.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del recurso' })
  @ApiOkResponse({
    description: 'Evoluciones del paciente.',
    schema: arrayOf(clinicalRecordViewSchema),
  })
  list(@Param('id', UuidParamPipe) id: string): Promise<ClinicalRecordWithAuthor[]> {
    return this.clinicalRecordsService.list(id);
  }

  @Post()
  @RequirePermission('clinical.write')
  @ApiOperation({
    summary: 'Registrar una evolución',
    description:
      'Alta de evolución: exige fecha, hora y al menos un dato clínico con contenido; ' +
      'los dientes referenciados deben ser FDI válidos y sin repetir. ' +
      'Requiere el permiso `clinical.write`.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del recurso' })
  @ApiBody({ schema: zodToSchema(createClinicalRecordSchema) })
  @ApiCreatedResponse({ description: 'Evolución registrada.', schema: clinicalRecordViewSchema })
  create(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(createClinicalRecordSchema)) body: CreateClinicalRecordInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<ClinicalRecordWithAuthor> {
    return this.clinicalRecordsService.create(id, body, actorOf(user, req));
  }

  /** Archivar una evolución (nunca borrado físico). */
  @Post(':recordId/archive')
  @HttpCode(200)
  @RequirePermission('clinical.write')
  @ApiOperation({
    summary: 'Archivar una evolución',
    description:
      'Soft delete: la evolución permanece en base y en auditoría, pero deja de listarse. ' +
      'Requiere el permiso `clinical.write`.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del recurso' })
  @ApiParam({ name: 'recordId', format: 'uuid', description: 'UUID del recurso' })
  @ApiOkResponse({ description: 'Evolución archivada.', schema: clinicalRecordViewSchema })
  archive(
    @Param('id', UuidParamPipe) id: string,
    @Param('recordId', UuidParamPipe) recordId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<ClinicalRecordWithAuthor> {
    return this.clinicalRecordsService.archive(id, recordId, actorOf(user, req));
  }
}
