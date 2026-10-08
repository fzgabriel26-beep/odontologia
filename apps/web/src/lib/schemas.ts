import { z } from 'zod';
import {
  adminResetPasswordSchema,
  registerSchema,
  resetPasswordSchema,
  roleKeySchema,
  updateUserSchema,
} from '@odonto/validation';

/**
 * Esquemas de formulario (frontend): extienden los esquemas compartidos del
 * backend con los campos de confirmación de contraseña, que solo existen
 * en la UI (el backend valida la contraseña en sí).
 */

export const registerFormSchema = registerSchema
  .extend({ confirm: z.string().min(1, 'Confirmá la contraseña.') })
  .refine((values) => values.confirm === values.password, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirm'],
  });
export type RegisterFormValues = z.infer<typeof registerFormSchema>;

export const resetFormSchema = resetPasswordSchema
  .extend({ confirm: z.string().min(1, 'Confirmá la contraseña.') })
  .refine((values) => values.confirm === values.password, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirm'],
  });
export type ResetFormValues = z.infer<typeof resetFormSchema>;

/** Edición de usuario desde el panel admin: datos personales + rol (sin contraseña). */
export const editUserFormSchema = updateUserSchema.extend({ roleKey: roleKeySchema });
export type EditUserFormValues = z.infer<typeof editUserFormSchema>;

/** Reset de contraseña por administrador, con confirmación (solo UI). */
export const adminResetFormSchema = adminResetPasswordSchema
  .extend({ confirm: z.string().min(1, 'Confirmá la contraseña.') })
  .refine((values) => values.confirm === values.password, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirm'],
  });
export type AdminResetFormValues = z.infer<typeof adminResetFormSchema>;

/**
 * Generación de código de invitación: la expiración son opciones fijas
 * (1, 7, 30 o 90 días, o sin expiración) para evitar rangos arbitrarios en UI.
 */
export const invitationCodeFormSchema = z.object({
  roleKey: roleKeySchema,
  expiresInDays: z.enum(['', '1', '7', '30', '90'], {
    message: 'Elegí la expiración del código.',
  }),
});
export type InvitationCodeFormValues = z.infer<typeof invitationCodeFormSchema>;
