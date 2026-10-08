import { z } from 'zod';
import { ROLES } from '@odonto/types';
import { dniSchema } from './dni';
import { emailSchema, passwordSchema } from './password';

/**
 * Esquemas del panel de administración (SDD, fase 3):
 * usuarios (CU-05) y códigos de invitación (CU-04).
 */

export const roleKeySchema = z.enum(ROLES, {
  message: 'Elegí un rol válido.',
});

/** Alta de usuario por parte del administrador (sin código de invitación). */
export const createUserSchema = z.object({
  firstName: z.string().trim().min(2, 'Ingresá el nombre.'),
  lastName: z.string().trim().min(2, 'Ingresá el apellido.'),
  dni: dniSchema,
  email: emailSchema,
  password: passwordSchema,
  roleKey: roleKeySchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Edición de datos personales/credenciales (el rol y el estado tienen endpoint propio). */
export const updateUserSchema = createUserSchema.omit({ password: true, roleKey: true }).partial();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const changeUserStatusSchema = z.object({
  status: z.enum(['ACTIVO', 'INACTIVO'], { message: 'Estado inválido.' }),
});
export type ChangeUserStatusInput = z.infer<typeof changeUserStatusSchema>;

export const changeUserRoleSchema = z.object({
  roleKey: roleKeySchema,
});
export type ChangeUserRoleInput = z.infer<typeof changeUserRoleSchema>;

/** Reset de contraseña por administrador (ADR-005). */
export const adminResetPasswordSchema = z.object({
  password: passwordSchema,
});
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;

/** Generación de código de invitación: el rol lo elige el administrador (ADR-013). */
export const createInvitationCodeSchema = z.object({
  roleKey: roleKeySchema,
  expiresInDays: z
    .number()
    .int('La expiración debe ser un número de días.')
    .min(1, 'La expiración mínima es de 1 día.')
    .max(365, 'La expiración máxima es de 365 días.')
    .nullable()
    .optional(),
});
export type CreateInvitationCodeInput = z.infer<typeof createInvitationCodeSchema>;

/** UUID de parámetro de ruta, con mensaje en español. */
export const uuidParamSchema = z.uuid({ message: 'Identificador inválido.' });
