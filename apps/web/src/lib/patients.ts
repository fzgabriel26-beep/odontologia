import type { FileKind, PatientStatus, ToothStatus, ToothType } from '@odonto/types';
import { API_URL } from './api';

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

/* ------------------------------------------------------------------ */
/* Historia clínica (fase 5)                                           */
/* ------------------------------------------------------------------ */

/** Autor de una evolución (visible en el listado: test "autor"). */
export interface ClinicalRecordAuthor {
  id: string;
  firstName: string;
  lastName: string;
}

/** Evolución de la historia clínica (GET/POST /patients/:id/records). */
export interface ClinicalRecord {
  id: string;
  patientId: string;
  /** Fecha date-only en ISO (aaaa-mm-ddT00:00:00.000Z). */
  date: string;
  time: string;
  reason: string | null;
  diagnosis: string | null;
  treatment: string | null;
  observations: string | null;
  indications: string | null;
  toothNumbers: number[];
  createdById: string;
  createdBy: ClinicalRecordAuthor;
  createdAt: string;
  archivedAt: string | null;
}

/** "Apellido, Nombre" del autor de una evolución. */
export function clinicalAuthorName(author: ClinicalRecordAuthor): string {
  return `${author.lastName}, ${author.firstName}`;
}

/* ------------------------------------------------------------------ */
/* Odontograma (fase 6)                                                */
/* ------------------------------------------------------------------ */

/** Diente del odontograma (uno de los 52 FDI del paciente). */
export interface Tooth {
  id: string;
  patientId: string;
  fdiNumber: number;
  type: ToothType;
  currentStatus: ToothStatus;
  observations: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Autor de un evento dental. */
export interface ToothEventAuthor {
  id: string;
  firstName: string;
  lastName: string;
}

/** Evento del historial de un diente (ineliminable). */
export interface ToothEvent {
  id: string;
  toothId: string;
  status: ToothStatus;
  note: string | null;
  /** Fecha date-only en ISO (aaaa-mm-ddT00:00:00.000Z). */
  eventDate: string;
  createdById: string;
  createdBy: ToothEventAuthor;
  createdAt: string;
}

/** "Apellido, Nombre" del autor de un evento dental. */
export function toothEventAuthorName(author: ToothEventAuthor): string {
  return `${author.lastName}, ${author.firstName}`;
}

/* ------------------------------------------------------------------ */
/* Archivos médicos (fase 7)                                           */
/* ------------------------------------------------------------------ */

/** Subidor de un archivo médico (visible en el listado). */
export interface MedicalFileUser {
  id: string;
  firstName: string;
  lastName: string;
}

/** Archivo médico (GET /patients/:id/files / GET /files/:id). */
export interface MedicalFile {
  id: string;
  patientId: string;
  /** Diente asociado (null = solo paciente). */
  toothId: string | null;
  /** Nombre saneado para mostrar. */
  name: string;
  originalName: string;
  kind: FileKind;
  mimeType: string;
  size: number;
  description: string | null;
  uploadedById: string;
  uploadedBy: MedicalFileUser;
  createdAt: string;
  archivedAt: string | null;
}

/** "Apellido, Nombre" del subidor de un archivo. */
export function fileUploaderName(user: MedicalFileUser): string {
  return `${user.lastName}, ${user.firstName}`;
}

/** Tamaño legible: B / KB / MB (un decimal por debajo de 10). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** URL del proxy de contenido (descarga o visualización inline). */
export function fileContentUrl(fileId: string, disposition?: 'attachment'): string {
  const suffix = disposition ? `?disposition=${disposition}` : '';
  return `${API_URL}/files/${fileId}/content${suffix}`;
}
