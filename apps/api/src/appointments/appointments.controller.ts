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
import { APPOINTMENT_STATUSES, PAYMENT_METHODS } from '@odonto/types';
import type {
  AppointmentListQueryInput,
  AppointmentStatsQueryInput,
  ChangeAppointmentStatusInput,
  CreateAppointmentInput,
  RegisterSignaInput,
  UpdateAppointmentInput,
} from '@odonto/validation';
import {
  appointmentListQuerySchema,
  appointmentStatsQuerySchema,
  changeAppointmentStatusSchema,
  createAppointmentSchema,
  registerSignaSchema,
  updateAppointmentSchema,
} from '@odonto/validation';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { userSummarySchema } from '../swagger/response-schemas';
import { arrayOf, zodToSchema } from '../swagger/zod-schema';
import {
  AppointmentsService,
  type AppointmentActor,
  type AppointmentDetailView,
  type AppointmentStatsView,
  type AppointmentView,
  type ProfessionalView,
} from './appointments.service';

interface RequestWithIp {
  ip?: string;
}

function actorOf(user: AuthUser, req: RequestWithIp): AppointmentActor {
  return { id: user.id, ip: req.ip };
}

/** Turno serializado (`AppointmentView`): paciente con DNI, autor y cancelador. */
const appointmentViewSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    patientId: { type: 'string', format: 'uuid' },
    patient: {
      type: 'object',
      description: 'Paciente del turno (vista).',
      properties: {
        id: { type: 'string', format: 'uuid' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        dni: { type: 'string' },
      },
      required: ['id', 'firstName', 'lastName', 'dni'],
    },
    professionalId: { type: 'string', format: 'uuid' },
    professional: { ...userSummarySchema, description: 'Profesional asignado.' },
    date: { type: 'string', format: 'date', description: 'Fecha aaaa-mm-dd.' },
    time: { type: 'string', description: 'Hora HH:MM.' },
    durationMin: { type: 'integer', description: 'Duración en minutos.' },
    reason: { type: 'string', nullable: true, description: 'Motivo del turno.' },
    status: { type: 'string', enum: [...APPOINTMENT_STATUSES] },
    observations: { type: 'string', nullable: true },
    signaRequired: { type: 'boolean', description: '¿Requiere seña?' },
    signaAmount: { type: 'number', nullable: true, description: 'Monto de la seña.' },
    signaPaid: { type: 'boolean' },
    signaReceived: { type: 'number', nullable: true, description: 'Monto recibido.' },
    signaDate: { type: 'string', format: 'date', nullable: true, description: 'Fecha de pago.' },
    signaMethod: { type: 'string', enum: [...PAYMENT_METHODS], nullable: true },
    signaNotes: { type: 'string', nullable: true },
    cancelledAt: { type: 'string', format: 'date-time', nullable: true },
    cancelledBy: { ...userSummarySchema, nullable: true },
    cancelReason: { type: 'string', nullable: true },
    createdById: { type: 'string', format: 'uuid' },
    createdBy: { ...userSummarySchema },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'id',
    'patientId',
    'patient',
    'professionalId',
    'professional',
    'date',
    'time',
    'durationMin',
    'status',
    'signaRequired',
    'signaPaid',
    'createdById',
    'createdBy',
    'createdAt',
    'updatedAt',
  ],
};

/** Transición de turno (`AppointmentEventView`): historial inmutable del CU-13. */
const appointmentEventSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    appointmentId: { type: 'string', format: 'uuid' },
    fromStatus: {
      type: 'string',
      enum: [...APPOINTMENT_STATUSES],
      nullable: true,
      description: 'Estado anterior (null en el primer evento).',
    },
    toStatus: { type: 'string', enum: [...APPOINTMENT_STATUSES] },
    reason: {
      type: 'string',
      nullable: true,
      description: 'Motivo (obligatorio en CANCELADO/AUSENTE/REPROGRAMADO).',
    },
    createdById: { type: 'string', format: 'uuid' },
    createdBy: { ...userSummarySchema },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'appointmentId', 'toStatus', 'createdById', 'createdBy', 'createdAt'],
};

/** Detalle de turno (`AppointmentDetailView`): turno + historial de transiciones. */
const appointmentDetailViewSchema: SchemaObject = {
  ...appointmentViewSchema,
  properties: {
    ...appointmentViewSchema.properties,
    events: {
      type: 'array',
      description: 'Historial de transiciones, más reciente primero.',
      items: appointmentEventSchema,
    },
  },
  required: [...(appointmentViewSchema.required ?? []), 'events'],
};

/** Indicadores del dashboard (`AppointmentStatsView`). */
const appointmentStatsSchema: SchemaObject = {
  type: 'object',
  properties: {
    date: {
      type: 'string',
      format: 'date',
      description: 'Fecha de referencia (por defecto, hoy en el servidor).',
    },
    today: { type: 'integer', description: 'Turnos de la fecha.' },
    upcoming: { type: 'integer', description: 'Próximos turnos no cerrados.' },
    byStatus: {
      type: 'object',
      description: 'Conteo total de turnos por estado (claves de APPOINTMENT_STATUSES).',
      additionalProperties: { type: 'integer' },
    },
  },
  required: ['date', 'today', 'upcoming', 'byStatus'],
};

/** Usuario activo asignable como profesional (`ProfessionalView`). */
const professionalSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    roleKey: { type: 'string', description: 'Clave del rol (ADMIN, ODONTOLOGO, SECRETARIO).' },
  },
  required: ['id', 'firstName', 'lastName', 'roleKey'],
};

/**
 * Agenda de turnos (SDD CU-12 a CU-14 / fase 8): listado con filtros, alta,
 * edición, transiciones de estado, seña y estadísticas del dashboard.
 * Requiere `appointments.read` para lectura y `appointments.write` para mutaciones.
 */
@ApiTags('Agenda')
@ApiSecurity('sessionCookie')
@Controller()
@RequirePermission('appointments.read')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /** Listado de la agenda; por defecto devuelve el día de hoy. */
  @Get('appointments')
  @ApiOperation({
    summary: 'Listar turnos de la agenda',
    description:
      'Turnos del rango fechado (por defecto, hoy) ordenados por fecha y hora; ' +
      'filtros opcionales por profesional y estado.',
  })
  @ApiQuery({ name: 'from', required: false, description: 'Fecha desde (aaaa-mm-dd).' })
  @ApiQuery({ name: 'to', required: false, description: 'Fecha hasta (aaaa-mm-dd).' })
  @ApiQuery({ name: 'professionalId', required: false, description: 'UUID del profesional.' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Estado del turno.',
    enum: [...APPOINTMENT_STATUSES],
  })
  @ApiOkResponse({
    description: 'Turnos del rango consultado.',
    schema: arrayOf(appointmentViewSchema),
  })
  list(
    @Query(new ZodValidationPipe(appointmentListQuerySchema)) query: AppointmentListQueryInput,
  ): Promise<AppointmentView[]> {
    return this.appointmentsService.list(query);
  }

  /**
   * Usuarios activos asignables como profesional. Va en este módulo (no en
   * /users) porque el listado de usuarios exige `users.manage` (solo admin) y
   * el personal de agenda necesita el combo igual.
   */
  @Get('appointments/professionals')
  @ApiOperation({
    summary: 'Listar profesionales asignables',
    description:
      'Usuarios activos para el combo de profesional del turno; vive en agenda porque ' +
      'el listado de /users exige `users.manage` (solo admin).',
  })
  @ApiOkResponse({ description: 'Profesionales activos.', schema: arrayOf(professionalSchema) })
  professionals(): Promise<ProfessionalView[]> {
    return this.appointmentsService.professionals();
  }

  /** Indicadores del dashboard. Declarado antes de /:id (rutas estáticas primero). */
  @Get('appointments/stats')
  @ApiOperation({
    summary: 'Obtener indicadores del dashboard',
    description:
      'Turnos de la fecha de referencia, próximos no cerrados y conteo total por estado; ' +
      'si no se envía fecha, se usa la de hoy en el servidor.',
  })
  @ApiQuery({ name: 'date', required: false, description: 'Fecha de referencia (aaaa-mm-dd).' })
  @ApiOkResponse({ description: 'Indicadores del dashboard.', schema: appointmentStatsSchema })
  stats(
    @Query(new ZodValidationPipe(appointmentStatsQuerySchema)) query: AppointmentStatsQueryInput,
  ): Promise<AppointmentStatsView> {
    return this.appointmentsService.stats(query);
  }

  @Get('appointments/:id')
  @ApiOperation({
    summary: 'Obtener el detalle de un turno',
    description: 'Turno con su historial de transiciones (más reciente primero).',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del turno.' })
  @ApiOkResponse({ description: 'Detalle del turno.', schema: appointmentDetailViewSchema })
  get(@Param('id', UuidParamPipe) id: string): Promise<AppointmentDetailView> {
    return this.appointmentsService.get(id);
  }

  @Post('appointments')
  @RequirePermission('appointments.write')
  @ApiOperation({
    summary: 'Crear un turno',
    description:
      'Alta para un paciente y profesional existentes; el turno nace en estado ' +
      'PENDIENTE y queda auditado.',
  })
  @ApiBody({ schema: zodToSchema(createAppointmentSchema) })
  @ApiCreatedResponse({ description: 'Turno creado.', schema: appointmentViewSchema })
  create(
    @Body(new ZodValidationPipe(createAppointmentSchema)) body: CreateAppointmentInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<AppointmentView> {
    return this.appointmentsService.create(body, actorOf(user, req));
  }

  @Patch('appointments/:id')
  @RequirePermission('appointments.write')
  @ApiOperation({
    summary: 'Editar datos de un turno',
    description:
      'Modifica campos operativos de un turno abierto; el paciente y el estado tienen ' +
      'endpoints propios. Responde 409 si el turno está cerrado.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del turno.' })
  @ApiBody({ schema: zodToSchema(updateAppointmentSchema) })
  @ApiOkResponse({ description: 'Turno actualizado.', schema: appointmentViewSchema })
  update(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateAppointmentSchema)) body: UpdateAppointmentInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<AppointmentView> {
    return this.appointmentsService.update(id, body, actorOf(user, req));
  }

  /** Transición de estado (CU-13): motivo obligatorio para cerrar/ausentar/reprogramar. */
  @Post('appointments/:id/status')
  @HttpCode(200)
  @RequirePermission('appointments.write')
  @ApiOperation({
    summary: 'Cambiar el estado de un turno',
    description:
      'Aplica la máquina de transiciones del backend (409 si no está permitida) y crea ' +
      'un evento inmutable; el motivo es obligatorio en CANCELADO, AUSENTE y REPROGRAMADO.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del turno.' })
  @ApiBody({ schema: zodToSchema(changeAppointmentStatusSchema) })
  @ApiOkResponse({
    description: 'Turno con su historial de transiciones.',
    schema: appointmentDetailViewSchema,
  })
  changeStatus(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(changeAppointmentStatusSchema)) body: ChangeAppointmentStatusInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<AppointmentDetailView> {
    return this.appointmentsService.changeStatus(id, body, actorOf(user, req));
  }

  /** Registro/anulación de la seña (CU-14). */
  @Post('appointments/:id/signa')
  @HttpCode(200)
  @RequirePermission('appointments.write')
  @ApiOperation({
    summary: 'Registrar o anular la seña de un turno',
    description:
      'Si signaPaid es true exige monto recibido, fecha y método de pago; si es false ' +
      'anula la seña y borra esos datos. No cambia el estado (409 si está cerrado).',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del turno.' })
  @ApiBody({ schema: zodToSchema(registerSignaSchema) })
  @ApiOkResponse({ description: 'Turno con la seña registrada.', schema: appointmentViewSchema })
  registerSigna(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(registerSignaSchema)) body: RegisterSignaInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<AppointmentView> {
    return this.appointmentsService.registerSigna(id, body, actorOf(user, req));
  }

  /** Turnos de la ficha del paciente (la agenda del paciente, con cerrados). */
  @Get('patients/:id/appointments')
  @ApiOperation({
    summary: 'Listar los turnos de un paciente',
    description: 'Agenda completa del paciente (incluye cerrados), más recientes primero.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del paciente.' })
  @ApiOkResponse({ description: 'Turnos del paciente.', schema: arrayOf(appointmentViewSchema) })
  byPatient(@Param('id', UuidParamPipe) id: string): Promise<AppointmentView[]> {
    return this.appointmentsService.byPatient(id);
  }
}
