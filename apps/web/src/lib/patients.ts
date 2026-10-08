import type { PatientStatus } from '@odonto/types';

/** Fila de paciente tal como la devuelve la API (GET /patients, sin relaciones). */
export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dni: string;
  /** Fecha de nacimiento como ISO (aaaa-mm-ddT00:00:00.000Z) o null. */
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  locality: string | null;
  province: string | null;
  emergencyContact: string | null;
  healthInsurer: string | null;
  memberNumber: string | null;
  allergies: string | null;
  medications: string | null;
  background: string | null;
  notes: string | null;
  status: PatientStatus;
  archivedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Formatea una fecha "date-only" (medianoche UTC) sin corrimiento de zona:
 * toLocaleDateString desplazaría el día en UTC-3, así que se usa el sufijo ISO.
 */
export function formatDateOnly(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return '—';
  return `${day}/${month}/${year}`;
}

/** Edad en años completos a partir de una fecha ISO, o null si no hay dato. */
export function patientAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

/** "Apellido, Nombre" para títulos de ficha y tablas. */
export function patientFullName(patient: Pick<Patient, 'firstName' | 'lastName'>): string {
  return `${patient.lastName}, ${patient.firstName}`;
}
