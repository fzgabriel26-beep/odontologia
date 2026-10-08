import { z } from 'zod';

/**
 * Validación del DNI argentino (SDD §5, regla 3).
 *
 * - Obligatorio.
 * - Solo dígitos, con puntos opcionales de formato (ej. 30.123.456).
 * - Longitud de 7 u 8 dígitos.
 * - La unicidad se garantiza en la base de datos (constraint UNIQUE);
 *   esta validación solo cubre el formato.
 */
const DNI_REGEX = /^\d{1,2}(\.?\d{3}){1,2}$/;

export const dniSchema = z
  .string()
  .trim()
  .min(1, 'El DNI es obligatorio.')
  .regex(DNI_REGEX, 'El DNI debe tener 7 u 8 dígitos (se permiten puntos).')
  .transform((value) => value.replace(/\./g, ''))
  .refine((value) => value.length >= 7 && value.length <= 8, {
    message: 'El DNI debe tener 7 u 8 dígitos.',
  });

/** Valida un DNI y devuelve true/false (útil para pruebas y backend). */
export function isValidDni(value: string): boolean {
  return dniSchema.safeParse(value).success;
}

/** Normaliza un DNI quitando puntos y espacios. */
export function normalizeDni(value: string): string {
  return value.replace(/[\s.]/g, '');
}
