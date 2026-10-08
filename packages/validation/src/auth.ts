import { z } from 'zod';
import { dniSchema } from './dni';
import { emailSchema, passwordSchema } from './password';

/**
 * Esquemas de autenticación (SDD, fase 2).
 * Se consumen en React Hook Form (frontend) y en el pipe Zod de NestJS (backend).
 */

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Ingresá tu contraseña.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Formato del código de invitación: ODONTO-XXXX-XXXX (mayúsculas y números). */
const INVITATION_CODE_REGEX = /^ODONTO-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export const invitationCodeSchema = z
  .string()
  .trim()
  .min(1, 'Ingresá el código de invitación.')
  .transform((value) => value.toUpperCase())
  .pipe(
    z.string().regex(INVITATION_CODE_REGEX, {
      message: 'El código de invitación no tiene el formato ODONTO-XXXX-XXXX.',
    }),
  );

export const registerSchema = z.object({
  firstName: z.string().trim().min(2, 'Ingresá el nombre.'),
  lastName: z.string().trim().min(2, 'Ingresá el apellido.'),
  dni: dniSchema,
  email: emailSchema,
  password: passwordSchema,
  invitationCode: invitationCodeSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Token de restablecimiento inválido.'),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Ingresá tu contraseña actual.'),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
