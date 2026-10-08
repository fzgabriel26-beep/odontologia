import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { CreateClinicalRecordInput } from '@odonto/validation';
import { createClinicalRecordSchema } from '@odonto/validation';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
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
 * Historia clínica (SDD CU-08): consulta y alta de evoluciones por paciente.
 * Requiere `clinical.read` para lectura y `clinical.write` para mutaciones.
 */
@Controller('patients/:id/records')
@RequirePermission('clinical.read')
export class ClinicalRecordsController {
  constructor(private readonly clinicalRecordsService: ClinicalRecordsService) {}

  @Get()
  list(@Param('id', UuidParamPipe) id: string): Promise<ClinicalRecordWithAuthor[]> {
    return this.clinicalRecordsService.list(id);
  }

  @Post()
  @RequirePermission('clinical.write')
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
  archive(
    @Param('id', UuidParamPipe) id: string,
    @Param('recordId', UuidParamPipe) recordId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<ClinicalRecordWithAuthor> {
    return this.clinicalRecordsService.archive(id, recordId, actorOf(user, req));
  }
}
