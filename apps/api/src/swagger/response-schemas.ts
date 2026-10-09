import type { SchemaObject } from '@nestjs/swagger';
import {
  APPOINTMENT_STATUSES,
  FILE_KINDS,
  INVITATION_STATUSES,
  PATIENT_STATUSES,
  TOOTH_STATUSES,
  TOOTH_TYPES,
  USER_STATUSES,
} from '@odonto/types';

/**
 * Schemas de RESPUESTA para Swagger (SDD §9, fase 12).
 *
 * Se escriben a mano a partir de los modelos de `prisma/schema.prisma` y de
 * las vistas ("*View") que devuelven los services. Por seguridad, los docs
 * **nunca** exponen campos internos: `passwordHash`, `tokenHash` ni
 * `storageKey`. Si cambia un modelo o una vista, actualizar acá.
 *
 * Los schemas de ENTRADA no viven acá: se generan de los zod de
 * `@odonto/validation` con `zodToSchema()` (fuente única de verdad).
 */

/* ------------------------------------------------------------------ */
/* Genéricos                                                          */
/* ------------------------------------------------------------------ */

/** Error estándar de la API: `{ error: { code, message } }` (formato propio). */
export const errorSchema: SchemaObject = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Código estable para el cliente (ej. INVALID_CREDENTIALS).',
        },
        message: { type: 'string', description: 'Mensaje en español para el usuario.' },
      },
      required: ['code', 'message'],
    },
    message: { type: 'string', description: 'Mensaje (errores de validación y errores de Nest).' },
    statusCode: { type: 'integer' },
  },
  description: 'Forma de error de la API (401/403/404/409/422/429...).',
};

/** Respuesta de confirmación mínima: `{ ok: true }`. */
export const okSchema: SchemaObject = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
};

/* ------------------------------------------------------------------ */
/* Usuarios y sesión                                                   */
/* ------------------------------------------------------------------ */

/** Usuario de sesión (idéntico a `SessionUser` de @odonto/types). */
export const sessionUserSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    email: { type: 'string', format: 'email' },
    role: {
      type: 'object',
      properties: {
        key: { type: 'string', enum: ['ADMIN', 'ODONTOLOGO', 'SECRETARIO'] },
        name: { type: 'string' },
      },
      required: ['key', 'name'],
    },
    permissions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Permisos granulares del rol (verificados en backend, SDD §10).',
    },
  },
  required: ['id', 'firstName', 'lastName', 'email', 'role', 'permissions'],
};

/** `{ user: SessionUser }` — respuestas de /auth/login, /auth/me y /auth/register. */
export const sessionUserWrapperSchema: SchemaObject = {
  type: 'object',
  properties: { user: sessionUserSchema },
  required: ['user'],
};

/** Referencia mínima a un usuario (autor, subidor, profesional...). */
export const userSummarySchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
  },
  required: ['id', 'firstName', 'lastName'],
};

/** Usuario completo del panel de administración (GET /users). */
export const adminUserSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    dni: { type: 'string', description: 'DNI (único, nunca es la clave primaria).' },
    email: { type: 'string', format: 'email' },
    phone: { type: 'string', nullable: true },
    role: {
      type: 'object',
      properties: {
        key: { type: 'string', enum: ['ADMIN', 'ODONTOLOGO', 'SECRETARIO'] },
        name: { type: 'string' },
      },
      required: ['key', 'name'],
    },
    status: { type: 'string', enum: [...USER_STATUSES] },
    lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'firstName', 'lastName', 'dni', 'email', 'role', 'status'],
};

/* ------------------------------------------------------------------ */
/* Pacientes                                                           */
/* ------------------------------------------------------------------ */

export const patientSchema: SchemaObject = {
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
    createdBy: { ...userSummarySchema, nullable: true },
  },
  required: ['id', 'firstName', 'lastName', 'dni', 'status'],
};

/* ------------------------------------------------------------------ */
/* Historia clínica                                                    */
/* ------------------------------------------------------------------ */

export const clinicalRecordSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    patientId: { type: 'string', format: 'uuid' },
    date: { type: 'string', format: 'date-time', description: 'Fecha de la atención.' },
    time: { type: 'string', description: 'Hora HH:MM.' },
    reason: { type: 'string', nullable: true, description: 'Motivo de consulta.' },
    diagnosis: { type: 'string', nullable: true },
    treatment: { type: 'string', nullable: true },
    observations: { type: 'string', nullable: true },
    indications: { type: 'string', nullable: true },
    toothNumbers: {
      type: 'array',
      items: { type: 'integer' },
      description: 'Dientes relacionados (numeración FDI).',
    },
    createdBy: { ...userSummarySchema },
    createdAt: { type: 'string', format: 'date-time' },
    archivedAt: { type: 'string', format: 'date-time', nullable: true },
  },
  required: ['id', 'patientId', 'date', 'time', 'toothNumbers', 'createdBy'],
};

/* ------------------------------------------------------------------ */
/* Odontograma                                                         */
/* ------------------------------------------------------------------ */

export const toothSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    patientId: { type: 'string', format: 'uuid' },
    fdiNumber: { type: 'integer', description: 'Número FDI (ej. 18, 21, 55).' },
    type: { type: 'string', enum: [...TOOTH_TYPES] },
    currentStatus: { type: 'string', enum: [...TOOTH_STATUSES] },
    observations: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'patientId', 'fdiNumber', 'type', 'currentStatus'],
};

export const toothEventSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    toothId: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: [...TOOTH_STATUSES] },
    note: { type: 'string', nullable: true },
    eventDate: { type: 'string', format: 'date-time' },
    createdBy: { ...userSummarySchema },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'toothId', 'status', 'eventDate', 'createdBy'],
};

/* ------------------------------------------------------------------ */
/* Agenda                                                              */
/* ------------------------------------------------------------------ */

export const appointmentSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    patientId: { type: 'string', format: 'uuid' },
    professionalId: { type: 'string', format: 'uuid' },
    patient: { ...userSummarySchema, description: 'Paciente del turno (vista).' },
    professional: { ...userSummarySchema },
    date: { type: 'string', format: 'date-time' },
    time: { type: 'string', description: 'Hora HH:MM.' },
    durationMin: { type: 'integer' },
    reason: { type: 'string', nullable: true },
    status: { type: 'string', enum: [...APPOINTMENT_STATUSES] },
    observations: { type: 'string', nullable: true },
    signaRequired: { type: 'boolean', description: '¿Requiere seña?' },
    signaAmount: { type: 'string', nullable: true, description: 'Monto de la seña (decimal).' },
    signaPaid: { type: 'boolean' },
    signaReceived: { type: 'string', nullable: true, description: 'Monto recibido (decimal).' },
    signaDate: { type: 'string', format: 'date-time', nullable: true },
    signaMethod: {
      type: 'string',
      enum: ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'OTRO'],
      nullable: true,
    },
    signaNotes: { type: 'string', nullable: true },
    cancelledAt: { type: 'string', format: 'date-time', nullable: true },
    cancelReason: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'patientId', 'professionalId', 'date', 'time', 'durationMin', 'status'],
};

/* ------------------------------------------------------------------ */
/* Archivos médicos                                                    */
/* ------------------------------------------------------------------ */

export const medicalFileSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    patientId: { type: 'string', format: 'uuid' },
    toothId: { type: 'string', format: 'uuid', nullable: true },
    name: { type: 'string', description: 'Nombre sanitizado (del servidor).' },
    originalName: { type: 'string' },
    kind: { type: 'string', enum: [...FILE_KINDS] },
    mimeType: { type: 'string' },
    size: { type: 'integer', description: 'Tamaño en bytes.' },
    description: { type: 'string', nullable: true },
    uploadedBy: { ...userSummarySchema },
    createdAt: { type: 'string', format: 'date-time' },
    archivedAt: { type: 'string', format: 'date-time', nullable: true },
  },
  required: ['id', 'patientId', 'name', 'originalName', 'kind', 'mimeType', 'size', 'uploadedBy'],
  description: 'Nunca expone la clave de almacenamiento (storageKey) ni la URL directa.',
};

/* ------------------------------------------------------------------ */
/* Invitaciones y auditoría                                           */
/* ------------------------------------------------------------------ */

export const invitationCodeSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    code: { type: 'string', description: 'Código de invitación (no hay registro público).' },
    status: { type: 'string', enum: [...INVITATION_STATUSES] },
    role: { allOf: [{ type: 'object' }], description: 'Rol que otorga el código.' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    revokedAt: { type: 'string', format: 'date-time', nullable: true },
    usedAt: { type: 'string', format: 'date-time', nullable: true },
    createdBy: { ...userSummarySchema },
    usedBy: { ...userSummarySchema, nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'code', 'status', 'createdAt'],
};

export const auditEntrySchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid', nullable: true },
    user: { ...userSummarySchema, nullable: true },
    action: { type: 'string', description: 'Acción (constantes AUDIT_ACTIONS).' },
    entityType: { type: 'string', description: 'Entidad afectada (PATIENT, APPOINTMENT...).' },
    entityId: { type: 'string', format: 'uuid', nullable: true },
    metadata: { type: 'object', nullable: true },
    ip: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'action', 'entityType', 'createdAt'],
  description: 'Auditoría insert-only: nunca se modifica ni elimina (SDD §10).',
};
