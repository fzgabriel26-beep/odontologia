import { z } from 'zod';
import { TOOTH_STATUSES } from '@odonto/types';

/**
 * Esquemas del odontograma (SDD, fase 6 / CU-09).
 * Estado dental: los 14 estados del SDD §5.1 (lista extensible en @odonto/types).
 */

/** Estado dental válido (enum compartido frontend/backend). */
export const toothStatusSchema = z.enum(TOOTH_STATUSES, { message: 'Estado dental inválido.' });

/**
 * Registrar un evento en un diente: estado obligatorio; nota y fecha opcionales
 * (el servicio usa la fecha actual cuando no viene).
 */
export const createToothEventSchema = z.object({
  status: toothStatusSchema,
  note: z.string().trim().nullish(),
  eventDate: z.iso.date({ message: 'Ingresá una fecha válida (aaaa-mm-dd).' }).optional(),
});
export type CreateToothEventInput = z.infer<typeof createToothEventSchema>;

/** Observaciones del diente (panel lateral): al menos un campo presente. */
export const updateToothSchema = z
  .object({
    observations: z.string().trim().nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'No hay datos para actualizar.',
    path: ['form'],
  });
export type UpdateToothInput = z.infer<typeof updateToothSchema>;
