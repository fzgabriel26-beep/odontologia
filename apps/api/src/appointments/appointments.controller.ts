import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
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

/**
 * Agenda de turnos (SDD CU-12 a CU-14 / fase 8): listado con filtros, alta,
 * edición, transiciones de estado, seña y estadísticas del dashboard.
 * Requiere `appointments.read` para lectura y `appointments.write` para mutaciones.
 */
@Controller()
@RequirePermission('appointments.read')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /** Listado de la agenda; por defecto devuelve el día de hoy. */
  @Get('appointments')
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
  professionals(): Promise<ProfessionalView[]> {
    return this.appointmentsService.professionals();
  }

  /** Indicadores del dashboard. Declarado antes de /:id (rutas estáticas primero). */
  @Get('appointments/stats')
  stats(
    @Query(new ZodValidationPipe(appointmentStatsQuerySchema)) query: AppointmentStatsQueryInput,
  ): Promise<AppointmentStatsView> {
    return this.appointmentsService.stats(query);
  }

  @Get('appointments/:id')
  get(@Param('id', UuidParamPipe) id: string): Promise<AppointmentDetailView> {
    return this.appointmentsService.get(id);
  }

  @Post('appointments')
  @RequirePermission('appointments.write')
  create(
    @Body(new ZodValidationPipe(createAppointmentSchema)) body: CreateAppointmentInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<AppointmentView> {
    return this.appointmentsService.create(body, actorOf(user, req));
  }

  @Patch('appointments/:id')
  @RequirePermission('appointments.write')
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
  byPatient(@Param('id', UuidParamPipe) id: string): Promise<AppointmentView[]> {
    return this.appointmentsService.byPatient(id);
  }
}
