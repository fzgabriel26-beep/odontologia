import { z } from 'zod';

/**
 * Política de contraseña segura (SDD §10).
 * Se aplica en registro, recuperación y cambio de contraseña.
 * (En login solo se exige que no esté vacía, para no romper cuentas existentes.)
 */
export const PASSWORD_POLICY_MESSAGE =
  'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.';

export const passwordSchema = z
  .string()
  .min(8, PASSWORD_POLICY_MESSAGE)
  .regex(/[a-z]/, PASSWORD_POLICY_MESSAGE)
  .regex(/[A-Z]/, PASSWORD_POLICY_MESSAGE)
  .regex(/[0-9]/, PASSWORD_POLICY_MESSAGE);

/** Email normalizado: sin espacios y en minúsculas. */
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'El email es obligatorio.')
  .toLowerCase()
  .pipe(z.email({ message: 'Ingresá un email válido.' }));
