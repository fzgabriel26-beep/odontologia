import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { PATIENT_STATUSES } from '@odonto/types';
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
import { arrayOf, zodToSchema } from '../swagger/zod-schema';
import { PatientsService, type PatientActor } from './patients.service';

interface RequestWithIp {
  ip?: string;
}

function actorOf(user: AuthUser, req: RequestWithIp): PatientActor {
  return { id: user.id, ip: req.ip };
}

/**
 * Vista real de `PatientsService`: el modelo Prisma plano, sin incluir la
 * relación `createdBy` (solo expone el FK `createdById`).
 */
const patientRecordSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    dni: { type: 'string', description: 'DNI obligatorio y único.' },
    birthDate: { type: 'string', format: 'date-time', nullable: true },
    phone: { type: 'string', nullable: true },
    email: { type: 'string', format: 'email', nullable: true },
    address: { type: 'string', nullable: true },
    locality: { type: 'string', nullable: true },
    province: { type: 'string', nullable: true },
    emergencyContact: { type: 'string', nullable: true },
    healthInsurer: { type: 'string', nullable: true, description: 'Obra social.' },
    memberNumber: { type: 'string', nullable: true, description: 'N° de afiliado.' },
    allergies: { type: 'string', nullable: true },
    medications: { type: 'string', nullable: true },
    background: { type: 'string', nullable: true, description: 'Antecedentes.' },
    notes: { type: 'string', nullable: true },
    status: { type: 'string', enum: [...PATIENT_STATUSES] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    archivedAt: { type: 'string', format: 'date-time', nullable: true },
    createdById: { type: 'string', format: 'uuid', nullable: true },
  },
  required: ['id', 'firstName', 'lastName', 'dni', 'status'],
};

/**
 * Fichas de pacientes (SDD CU-06 y CU-07): alta, edición, búsqueda y archivado.
 * Requiere `patients.read` para lectura y `patients.write` para mutaciones
 * (ambos permisos están en todos los roles del personal).
 */
@ApiTags('Pacientes')
@ApiSecurity('sessionCookie')
@Controller('patients')
@RequirePermission('patients.read')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar pacientes',
    description:
      'Búsqueda por nombre, apellido, DNI, teléfono o email, con filtro opcional de estado. ' +
      'Requiere el permiso `patients.read`.',
  })
  @ApiQuery({
    name: 'query',
    required: false,
    description: 'Texto libre (nombre, apellido, DNI, teléfono o email); máximo 100 caracteres.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [...PATIENT_STATUSES],
    description: 'Filtra por estado de la ficha.',
  })
  @ApiOkResponse({ description: 'Listado de pacientes.', schema: arrayOf(patientRecordSchema) })
  list(
    @Query(new ZodValidationPipe(listPatientsQuerySchema)) query: ListPatientsQueryInput,
  ): Promise<Patient[]> {
    return this.patientsService.list(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Dar de alta un paciente',
    description:
      'Crea la ficha y sus 52 dientes FDI en una transacción (ADR-006). El DNI es único ' +
      '(409 si ya existe). Requiere el permiso `patients.write`.',
  })
  @ApiBody({ schema: zodToSchema(createPatientSchema) })
  @ApiCreatedResponse({ description: 'Paciente creado.', schema: patientRecordSchema })
  create(
    @Body(new ZodValidationPipe(createPatientSchema)) body: CreatePatientInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<Patient> {
    return this.patientsService.create(body, actorOf(user, req));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un paciente',
    description: 'Devuelve la ficha completa por su UUID. Requiere `patients.read`.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del recurso' })
  @ApiOkResponse({ description: 'Ficha del paciente.', schema: patientRecordSchema })
  get(@Param('id', UuidParamPipe) id: string): Promise<Patient> {
    return this.patientsService.get(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar la ficha de un paciente',
    description:
      'Actualización parcial: al menos un campo obligatorio; el DNI nuevo se valida por ' +
      'unicidad. Requiere el permiso `patients.write`.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del recurso' })
  @ApiBody({ schema: zodToSchema(updatePatientSchema) })
  @ApiOkResponse({ description: 'Paciente actualizado.', schema: patientRecordSchema })
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
  @ApiOperation({
    summary: 'Archivar un paciente',
    description:
      'Soft delete: la ficha nunca se borra físicamente. 409 si ya estaba archivada. ' +
      'Requiere el permiso `patients.write`.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del recurso' })
  @ApiOkResponse({ description: 'Paciente archivado.', schema: patientRecordSchema })
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
  @ApiOperation({
    summary: 'Reabrir un paciente archivado',
    description:
      'Reactiva la ficha (vuelve a ACTIVO y limpia archivedAt). 409 si no estaba archivada. ' +
      'Requiere el permiso `patients.write`.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del recurso' })
  @ApiOkResponse({ description: 'Paciente reabierto.', schema: patientRecordSchema })
  restore(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<Patient> {
    return this.patientsService.restore(id, actorOf(user, req));
  }
}
