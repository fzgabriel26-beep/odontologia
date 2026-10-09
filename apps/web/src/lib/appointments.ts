import {
  APPOINTMENT_CLOSED_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TRANSITIONS,
  PAYMENT_METHOD_LABELS,
  type AppointmentStatus,
  type PaymentMethod,
} from '@odonto/types';
import type {
  ChangeAppointmentStatusInput,
  CreateAppointmentInput,
  RegisterSignaInput,
  UpdateAppointmentInput,
} from '@odonto/validation';
import { apiFetch } from '@/lib/api';

/**
 * Cliente y tipos de la agenda de turnos (SDD, fase 8). El backend es la
 * autoridad en permisos, validaciones y transiciones; acá solo se reflejan
 * para habilitar botones y mostrar etiquetas en español.
 */

/** Tono de badge de estado (estructuralmente igual a BadgeTone de ui/badge). */
export type AppointmentBadgeTone = 'default' | 'success' | 'warning' | 'destructive' | 'info';

export interface AppointmentUserRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface AppointmentPatientRef extends AppointmentUserRef {
  dni: string;
}

export interface AppointmentEvent {
  id: string;
  appointmentId: string;
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus;
  reason: string | null;
  createdById: string;
  createdBy: AppointmentUserRef;
  createdAt: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patient: AppointmentPatientRef;
  professionalId: string;
  professional: AppointmentUserRef;
  date: string;
  time: string;
  durationMin: number;
  reason: string | null;
  status: AppointmentStatus;
  observations: string | null;
  signaRequired: boolean;
  signaAmount: number | null;
  signaPaid: boolean;
  signaReceived: number | null;
  signaDate: string | null;
  signaMethod: PaymentMethod | null;
  signaNotes: string | null;
  cancelledAt: string | null;
  cancelledBy: AppointmentUserRef | null;
  cancelReason: string | null;
  createdById: string;
  createdBy: AppointmentUserRef;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentDetail extends Appointment {
  /** Historial de transiciones (más reciente primero); nunca se borra. */
  events: AppointmentEvent[];
}

export interface AppointmentStats {
  date: string;
  today: number;
  upcoming: number;
  byStatus: Record<AppointmentStatus, number>;
}

export interface ProfessionalOption {
  id: string;
  firstName: string;
  lastName: string;
  roleKey: string;
}

/* ------------------------------------------------------------------ */
/* Etiquetas y helpers                                                 */
/* ------------------------------------------------------------------ */

export function userName(user: Pick<AppointmentUserRef, 'firstName' | 'lastName'>): string {
  return `${user.firstName} ${user.lastName}`;
}

export function appointmentStatusLabel(status: AppointmentStatus): string {
  return APPOINTMENT_STATUS_LABELS[status];
}

export function paymentMethodLabel(method: PaymentMethod | null): string | null {
  return method === null ? null : PAYMENT_METHOD_LABELS[method];
}

/** Transiciones permitidas desde el estado actual (la tabla vive en el backend). */
export function nextAppointmentStatuses(status: AppointmentStatus): readonly AppointmentStatus[] {
  return APPOINTMENT_TRANSITIONS[status];
}

export function isClosedAppointment(status: AppointmentStatus): boolean {
  return APPOINTMENT_CLOSED_STATUSES.includes(status);
}

/** Cierre/ausencia/reprogramación exigen motivo (SDD §5.4). */
export function statusNeedsReason(status: AppointmentStatus): boolean {
  return status === 'CANCELADO' || status === 'AUSENTE' || status === 'REPROGRAMADO';
}

export function appointmentStatusTone(status: AppointmentStatus): AppointmentBadgeTone {
  switch (status) {
    case 'CONFIRMADO':
    case 'SENA_REALIZADA':
      return 'info';
    case 'PRESENTE':
    case 'EN_ATENCION':
      return 'warning';
    case 'ATENDIDO':
      return 'success';
    case 'CANCELADO':
    case 'AUSENTE':
      return 'destructive';
    default:
      return 'default';
  }
}

/** Fecha local aaaa-mm-dd (para los inputs type=date y el rango de la agenda). */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Suma días a una fecha aaaa-mm-dd (aritmética de calendario en UTC). */
export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Etiqueta larga en español: "jueves 8 de octubre". */
export function formatDayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** Importe en pesos: $ 15.000,00 (es-AR). */
export function formatAmount(value: number | null): string | null {
  if (value === null) return null;
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

/* ------------------------------------------------------------------ */
/* Llamadas a la API                                                   */
/* ------------------------------------------------------------------ */

export interface AppointmentListParams {
  from?: string;
  to?: string;
  professionalId?: string;
  status?: AppointmentStatus;
}

export async function listAppointments(params: AppointmentListParams = {}): Promise<Appointment[]> {
  const search = new URLSearchParams();
  if (params.from !== undefined) search.set('from', params.from);
  if (params.to !== undefined) search.set('to', params.to);
  if (params.professionalId !== undefined) search.set('professionalId', params.professionalId);
  if (params.status !== undefined) search.set('status', params.status);
  const queryString = search.toString();
  return apiFetch<Appointment[]>(`/appointments${queryString ? `?${queryString}` : ''}`);
}

export function fetchAppointment(id: string): Promise<AppointmentDetail> {
  return apiFetch<AppointmentDetail>(`/appointments/${id}`);
}

export function fetchAppointmentStats(date?: string): Promise<AppointmentStats> {
  return apiFetch<AppointmentStats>(
    date !== undefined ? `/appointments/stats?date=${date}` : '/appointments/stats',
  );
}

export function createAppointment(body: CreateAppointmentInput): Promise<Appointment> {
  return apiFetch<Appointment>('/appointments', { method: 'POST', body });
}

export function updateAppointment(id: string, body: UpdateAppointmentInput): Promise<Appointment> {
  return apiFetch<Appointment>(`/appointments/${id}`, { method: 'PATCH', body });
}

export function changeAppointmentStatus(
  id: string,
  body: ChangeAppointmentStatusInput,
): Promise<AppointmentDetail> {
  return apiFetch<AppointmentDetail>(`/appointments/${id}/status`, { method: 'POST', body });
}

export function registerAppointmentSigna(
  id: string,
  body: RegisterSignaInput,
): Promise<Appointment> {
  return apiFetch<Appointment>(`/appointments/${id}/signa`, { method: 'POST', body });
}

export function listPatientAppointments(patientId: string): Promise<Appointment[]> {
  return apiFetch<Appointment[]>(`/patients/${patientId}/appointments`);
}

export function listProfessionals(): Promise<ProfessionalOption[]> {
  return apiFetch<ProfessionalOption[]>('/appointments/professionals');
}
