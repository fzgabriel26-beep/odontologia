import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type {
  CreatePatientInput,
  ListPatientsQueryInput,
  UpdatePatientInput,
} from '@odonto/validation';
import {
  createPatientSchema,
  listPatientsQuerySchema,
  updatePatientSchema,
} from '@odonto/validation';
import type { Patient } from '../generated/prisma/client';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { PatientsService, type PatientActor } from './patients.service';

interface RequestWithIp {
  ip?: string;
}

function actorOf(user: AuthUser, req: RequestWithIp): PatientActor {
  return { id: user.id, ip: req.ip };
}

/**
 * Fichas de pacientes (SDD CU-06 y CU-07): alta, edición, búsqueda y archivado.
 * Requiere `patients.read` para lectura y `patients.write` para mutaciones
 * (ambos permisos están en todos los roles del personal).
 */
@Controller('patients')
@RequirePermission('patients.read')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listPatientsQuerySchema)) query: ListPatientsQueryInput,
  ): Promise<Patient[]> {
    return this.patientsService.list(query);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createPatientSchema)) body: CreatePatientInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<Patient> {
    return this.patientsService.create(body, actorOf(user, req));
  }

  @Get(':id')
  get(@Param('id', UuidParamPipe) id: string): Promise<Patient> {
    return this.patientsService.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updatePatientSchema)) body: UpdatePatientInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<Patient> {
    return this.patientsService.update(id, body, actorOf(user, req));
  }

  /** Archivar (soft delete; la ficha nunca se borra físicamente). */
  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('patients.write')
  archive(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<Patient> {
    return this.patientsService.archive(id, actorOf(user, req));
  }

  /** Reabrir una ficha archivada. */
  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('patients.write')
  restore(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<Patient> {
    return this.patientsService.restore(id, actorOf(user, req));
  }
}
