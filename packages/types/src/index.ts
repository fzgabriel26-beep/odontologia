/**
 * Enums y constantes de dominio compartidos entre web, api y desktop.
 *
 * Fuente única de verdad para estados y roles (SDD §5.1).
 * Se usan como union types (sin enums de TS) para mantenerlos erasables
 * y compatibles con `isolatedModules`.
 */

/* ------------------------------------------------------------------ */
/* Roles y usuarios                                                    */
/* ------------------------------------------------------------------ */

export const ROLES = ['ADMIN', 'ODONTOLOGO', 'SECRETARIO'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  ODONTOLOGO: 'Odontólogo/a',
  SECRETARIO: 'Secretario/a',
};

export const USER_STATUSES = ['ACTIVO', 'INACTIVO'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
};

/* ------------------------------------------------------------------ */
/* Códigos de invitación                                               */
/* ------------------------------------------------------------------ */

export const INVITATION_STATUSES = ['DISPONIBLE', 'UTILIZADO', 'EXPIRADO', 'REVOGADO'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  DISPONIBLE: 'Disponible',
  UTILIZADO: 'Utilizado',
  EXPIRADO: 'Expirado',
  REVOGADO: 'Revocado',
};

/* ------------------------------------------------------------------ */
/* Pacientes                                                           */
/* ------------------------------------------------------------------ */

export const PATIENT_STATUSES = ['ACTIVO', 'ARCHIVADO'] as const;
export type PatientStatus = (typeof PATIENT_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Turnos                                                              */
/* ------------------------------------------------------------------ */

export const APPOINTMENT_STATUSES = [
  'PENDIENTE',
  'CONFIRMADO',
  'SENA_REALIZADA',
  'PRESENTE',
  'EN_ATENCION',
  'ATENDIDO',
  'CANCELADO',
  'AUSENTE',
  'REPROGRAMADO',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDIENTE: 'Pendiente',
  CONFIRMADO: 'Confirmado',
  SENA_REALIZADA: 'Seña realizada',
  PRESENTE: 'Presente',
  EN_ATENCION: 'En atención',
  ATENDIDO: 'Atendido',
  CANCELADO: 'Cancelado',
  AUSENTE: 'Ausente / No-show',
  REPROGRAMADO: 'Reprogramado',
};

export const PAYMENT_METHODS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'OTRO'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
  OTRO: 'Otro',
};

/* ------------------------------------------------------------------ */
/* Odontograma (FDI)                                                   */
/* ------------------------------------------------------------------ */

export const TOOTH_TYPES = ['PERMANENTE', 'TEMPORAL'] as const;
export type ToothType = (typeof TOOTH_TYPES)[number];

export const TOOTH_STATUSES = [
  'SANO',
  'CARIES',
  'RESTAURACION',
  'CORONA',
  'AUSENTE',
  'EXTRACCION_INDICADA',
  'EXTRACCION_REALIZADA',
  'ENDODONCIA',
  'IMPLANTE',
  'PROTESIS',
  'FRACTURA',
  'RETENIDO',
  'TRATAMIENTO_PENDIENTE',
  'OTRO',
] as const;
export type ToothStatus = (typeof TOOTH_STATUSES)[number];

export const TOOTH_STATUS_LABELS: Record<ToothStatus, string> = {
  SANO: 'Sano',
  CARIES: 'Caries',
  RESTAURACION: 'Restauración',
  CORONA: 'Corona',
  AUSENTE: 'Ausente',
  EXTRACCION_INDICADA: 'Extracción indicada',
  EXTRACCION_REALIZADA: 'Extracción realizada',
  ENDODONCIA: 'Endodoncia',
  IMPLANTE: 'Implante',
  PROTESIS: 'Prótesis',
  FRACTURA: 'Fractura',
  RETENIDO: 'Diente retenido',
  TRATAMIENTO_PENDIENTE: 'Tratamiento pendiente',
  OTRO: 'Otro',
};

/** Numeración FDI de dientes permanentes (por cuadrante). */
export const PERMANENT_TEETH_FDI: readonly number[] = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 48, 47, 46, 45, 44, 43,
  42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
];

/** Numeración FDI de dientes temporales/deciduos (por cuadrante). */
export const TEMPORARY_TEETH_FDI: readonly number[] = [
  55, 54, 53, 52, 51, 61, 62, 63, 64, 65, 85, 84, 83, 82, 81, 71, 72, 73, 74, 75,
];

/* ------------------------------------------------------------------ */
/* Archivos                                                            */
/* ------------------------------------------------------------------ */

export const FILE_KINDS = ['RADIOGRAFIA', 'FOTOGRAFIA', 'IMAGEN', 'PDF', 'DOCUMENTO', 'ESTUDIO'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_KIND_LABELS: Record<FileKind, string> = {
  RADIOGRAFIA: 'Radiografía',
  FOTOGRAFIA: 'Fotografía',
  IMAGEN: 'Imagen',
  PDF: 'PDF',
  DOCUMENTO: 'Documento',
  ESTUDIO: 'Estudio',
};

/** Extensiones permitidas para subida (whitelist). */
export const ALLOWED_FILE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.dcm',
  '.pdf',
] as const;

/** MIME types aceptados (validación de contenido en backend). */
export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/dicom',
] as const;

/* ------------------------------------------------------------------ */
/* Auditoría                                                           */
/* ------------------------------------------------------------------ */

export const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGOUT',
  'LOGIN_FAILED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_COMPLETED',
  'PASSWORD_RESET_BY_ADMIN',
  'PATIENT_CREATED',
  'PATIENT_UPDATED',
  'PATIENT_ARCHIVED',
  'CLINICAL_RECORD_CREATED',
  'CLINICAL_RECORD_ARCHIVED',
  'ODONTOGRAM_UPDATED',
  'TOOTH_EVENT_CREATED',
  'FILE_UPLOADED',
  'FILE_DOWNLOADED',
  'FILE_ARCHIVED',
  'APPOINTMENT_CREATED',
  'APPOINTMENT_UPDATED',
  'APPOINTMENT_STATUS_CHANGED',
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_ABSENT_REGISTERED',
  'SIGNA_REGISTERED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_STATUS_CHANGED',
  'USER_ROLE_CHANGED',
  'INVITATION_CODE_CREATED',
  'INVITATION_CODE_REVOKED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
