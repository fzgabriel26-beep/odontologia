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

/**
 * Transiciones válidas de estado de un turno (SDD CU-13 / fase 8). El backend
 * es la única autoridad que las aplica; esta tabla se comparte con la UI solo
 * para habilitar los botones de "Cambiar estado". Los estados cerrados
 * (ATENDIDO, CANCELADO, AUSENTE, REPROGRAMADO) no tienen salidas: el turno es
 * ineliminable y queda como cierre de su historia.
 */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  PENDIENTE: ['CONFIRMADO', 'SENA_REALIZADA', 'PRESENTE', 'CANCELADO', 'AUSENTE', 'REPROGRAMADO'],
  CONFIRMADO: ['SENA_REALIZADA', 'PRESENTE', 'CANCELADO', 'AUSENTE', 'REPROGRAMADO'],
  SENA_REALIZADA: ['PRESENTE', 'CANCELADO', 'AUSENTE', 'REPROGRAMADO'],
  PRESENTE: ['EN_ATENCION', 'REPROGRAMADO'],
  EN_ATENCION: ['ATENDIDO', 'REPROGRAMADO'],
  ATENDIDO: [],
  CANCELADO: [],
  AUSENTE: [],
  REPROGRAMADO: [],
};

/** Estados finales: el turno quedó cerrado (sin edición ni nuevas transiciones). */
export const APPOINTMENT_CLOSED_STATUSES: readonly AppointmentStatus[] = [
  'ATENDIDO',
  'CANCELADO',
  'AUSENTE',
  'REPROGRAMADO',
];

/** ¿La transición from → to está permitida? (La autoridad final es el backend.) */
export function canTransitionAppointment(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return APPOINTMENT_TRANSITIONS[from].includes(to);
}

/** El turno está en estado cerrado (no admite cambios). */
export function isClosedAppointment(status: AppointmentStatus): boolean {
  return APPOINTMENT_CLOSED_STATUSES.includes(status);
}

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
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 48, 47, 46, 45, 44, 43, 42, 41,
  31, 32, 33, 34, 35, 36, 37, 38,
];

/** Numeración FDI de dientes temporales/deciduos (por cuadrante). */
export const TEMPORARY_TEETH_FDI: readonly number[] = [
  55, 54, 53, 52, 51, 61, 62, 63, 64, 65, 85, 84, 83, 82, 81, 71, 72, 73, 74, 75,
];

/* ------------------------------------------------------------------ */
/* Archivos                                                            */
/* ------------------------------------------------------------------ */

export const FILE_KINDS = [
  'RADIOGRAFIA',
  'FOTOGRAFIA',
  'IMAGEN',
  'PDF',
  'DOCUMENTO',
  'ESTUDIO',
] as const;
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
export const ALLOWED_FILE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.dcm', '.pdf'] as const;

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
  'PASSWORD_CHANGED',
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
  // Fila que escribe el interceptor (fase 9) cuando una mutación exitosa no
  // dejó auditoría de dominio: red de seguridad, no reemplaza lo explícito.
  'API_MUTATION',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Etiquetas en español de cada acción de auditoría (panel y ficha del paciente). */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  LOGIN_FAILED: 'Inicio de sesión fallido',
  PASSWORD_RESET_REQUESTED: 'Recuperación de contraseña solicitada',
  PASSWORD_RESET_COMPLETED: 'Recuperación de contraseña completada',
  PASSWORD_RESET_BY_ADMIN: 'Contraseña restablecida por administrador',
  PASSWORD_CHANGED: 'Contraseña cambiada',
  PATIENT_CREATED: 'Paciente creado',
  PATIENT_UPDATED: 'Paciente actualizado',
  PATIENT_ARCHIVED: 'Ficha de paciente archivada',
  CLINICAL_RECORD_CREATED: 'Registro clínico creado',
  CLINICAL_RECORD_ARCHIVED: 'Registro clínico archivado',
  ODONTOGRAM_UPDATED: 'Odontograma actualizado',
  TOOTH_EVENT_CREATED: 'Evento de diente registrado',
  FILE_UPLOADED: 'Archivo médico subido',
  FILE_DOWNLOADED: 'Archivo médico descargado',
  FILE_ARCHIVED: 'Archivo médico archivado',
  APPOINTMENT_CREATED: 'Turno creado',
  APPOINTMENT_UPDATED: 'Turno actualizado',
  APPOINTMENT_STATUS_CHANGED: 'Estado de turno cambiado',
  APPOINTMENT_CANCELLED: 'Turno cancelado',
  APPOINTMENT_ABSENT_REGISTERED: 'Ausencia registrada',
  SIGNA_REGISTERED: 'Seña registrada',
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Usuario actualizado',
  USER_STATUS_CHANGED: 'Estado de usuario cambiado',
  USER_ROLE_CHANGED: 'Rol de usuario cambiado',
  INVITATION_CODE_CREATED: 'Código de invitación creado',
  INVITATION_CODE_REVOKED: 'Código de invitación revocado',
  API_MUTATION: 'Mutación sin registrar (interceptor)',
};

/** Etiquetas en español de las entidades registradas en `AuditLog.entityType`. */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  PATIENT: 'Paciente',
  CLINICAL_RECORD: 'Registro clínico',
  TOOTH: 'Diente',
  TOOTH_EVENT: 'Evento de diente',
  MEDICAL_FILE: 'Archivo médico',
  APPOINTMENT: 'Turno',
  USER: 'Usuario',
  INVITATION_CODE: 'Código de invitación',
  API: 'API',
};

/**
 * Usuario autenticado que devuelve la API en /auth/login, /auth/me y /auth/register.
 * El backend (AuthService) responde con esta misma forma.
 */
export interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: { key: string; name: string };
  permissions: string[];
}
