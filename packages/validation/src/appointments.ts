import { z } from 'zod';
import { APPOINTMENT_STATUSES, PAYMENT_METHODS } from '@odonto/types';

/**
 * Esquemas de agenda y turnos (SDD, fase 8 / CU-12 a CU-14):
 * alta/edición de turnos, transiciones de estado con motivo obligatorio en
 * cancelación/ausencia/reprogramación, registro de seña y filtros de listado.
 */

/** Fecha calendario estricta aaaa-mm-dd (valida el día real, ej.: 2026-02-30 no existe). */
export const dateOnlySchema = z.iso.date({ message: 'Ingresá una fecha válida (aaaa-mm-dd).' });

/** Hora en 24hs con dos dígitos (HH:MM). */
export const timeOnlySchema = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Ingresá una hora válida (HH:MM).');

export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES, {
  message: 'Estado de turno inválido.',
});

export const paymentMethodSchema = z.enum(PAYMENT_METHODS, {
  message: 'Método de pago inválido.',
});

/** Estados que exigen motivo para cambiar (SDD §5.4 / CU-13). */
const REASON_REQUIRED_STATUSES: readonly string[] = ['CANCELADO', 'AUSENTE', 'REPROGRAMADO'];

const optionalShortText = z.string().trim().max(500, 'Máximo 500 caracteres.').nullish();
const optionalLongText = z.string().trim().max(2000, 'Máximo 2000 caracteres.').nullish();

const signaAmountSchema = z
  .number({ message: 'Ingresá el monto de la seña.' })
  .positive('El monto de la seña debe ser mayor a cero.')
  .max(10_000_000, 'Monto de la seña inválido.')
  .nullable();

const durationSchema = z
  .number({ message: 'Ingresá la duración en minutos.' })
  .int('La duración debe ser un número entero de minutos.')
  .min(5, 'La duración mínima es de 5 minutos.')
  .max(480, 'La duración máxima es de 8 horas.');

/** Alta de turno (SDD CU-12). El paciente y el profesional deben existir. */
export const createAppointmentSchema = z.object({
  patientId: z.uuid({ message: 'Paciente inválido.' }),
  professionalId: z.uuid({ message: 'Profesional inválido.' }),
  date: dateOnlySchema,
  time: timeOnlySchema,
  durationMin: durationSchema,
  reason: optionalShortText,
  observations: optionalLongText,
  signaRequired: z.boolean().optional(),
  signaAmount: signaAmountSchema.optional(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

/**
 * Edición de un turno (SDD CU-12): solo campos operativos. El paciente no se
 * cambia (se cancela y se crea otro) y el estado/la seña abonada tienen
 * endpoints propios. Exige al menos un campo.
 */
export const updateAppointmentSchema = createAppointmentSchema
  .omit({ patientId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Enviá al menos un campo para modificar.',
    path: ['form'],
  });
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

/** Transición de estado (SDD CU-13): motivo obligatorio para cerrar/ausentar/reprogramar. */
export const changeAppointmentStatusSchema = z
  .object({
    status: appointmentStatusSchema,
    reason: optionalShortText,
  })
  .refine(
    (value) =>
      !REASON_REQUIRED_STATUSES.includes(value.status) ||
      (value.reason !== null && value.reason !== undefined && value.reason.length > 0),
    {
      message: 'El motivo es obligatorio para cancelar, marcar ausente o reprogramar un turno.',
      path: ['reason'],
    },
  );
export type ChangeAppointmentStatusInput = z.infer<typeof changeAppointmentStatusSchema>;

/** Registro de seña (SDD CU-14): monto recibido, fecha y método si fue abonada. */
export const registerSignaSchema = z
  .object({
    signaPaid: z.boolean({ message: 'Indicá si la seña fue abonada.' }),
    signaReceived: signaAmountSchema.optional(),
    signaDate: dateOnlySchema.nullable().optional(),
    signaMethod: paymentMethodSchema.nullable().optional(),
    signaNotes: optionalShortText,
  })
  .refine(
    (value) =>
      !value.signaPaid ||
      (value.signaReceived !== null &&
        value.signaReceived !== undefined &&
        value.signaDate !== null &&
        value.signaDate !== undefined &&
        value.signaMethod !== null &&
        value.signaMethod !== undefined),
    {
      message: 'Para marcar la seña como abonada completá monto recibido, fecha y método de pago.',
      path: ['form'],
    },
  );
export type RegisterSignaInput = z.infer<typeof registerSignaSchema>;

/** Filtros del listado de la agenda (SDD §9): rango de fechas y profesional. */
export const appointmentListQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    professionalId: z.uuid({ message: 'Profesional inválido.' }).optional(),
    status: appointmentStatusSchema.optional(),
  })
  .refine((value) => value.from === undefined || value.to === undefined || value.from <= value.to, {
    message: 'El rango de fechas es inválido: "desde" debe ser anterior o igual a "hasta".',
    path: ['from'],
  });
export type AppointmentListQueryInput = z.infer<typeof appointmentListQuerySchema>;

/** Estadísticas del dashboard: fecha de referencia (por defecto, hoy en el servidor). */
export const appointmentStatsQuerySchema = z.object({
  date: dateOnlySchema.optional(),
});
export type AppointmentStatsQueryInput = z.infer<typeof appointmentStatsQuerySchema>;
