import { z } from 'zod';
import { registerSchema, resetPasswordSchema } from '@odonto/validation';

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
