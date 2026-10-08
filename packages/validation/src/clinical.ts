import { z } from 'zod';
import { PERMANENT_TEETH_FDI, TEMPORARY_TEETH_FDI } from '@odonto/types';

/** Todos los números FDI válidos: 32 permanentes + 20 temporales (52 en total). */
export const FDI_NUMBERS: readonly number[] = [...PERMANENT_TEETH_FDI, ...TEMPORARY_TEETH_FDI]
  .slice()
  .sort((a, b) => a - b);

const FDI_SET = new Set(FDI_NUMBERS);

/** Texto clínico libre (motivo, diagnóstico, etc.): opcional, sin límite de longitud. */
const optionalClinicalText = z.string().trim().nullish();

/**
 * Alta de evolución en la historia clínica (SDD, fase 5 / CU-08).
 * - Fecha y hora obligatorias y con formato estricto.
 * - Al menos un dato clínico con contenido.
 * - Dientes referenciados como FDI válidos y sin repetir (puede venir vacío).
 */
export const createClinicalRecordSchema = z
  .object({
    date: z.iso.date({ message: 'Ingresá una fecha válida (aaaa-mm-dd).' }),
    time: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Ingresá una hora válida (HH:MM).'),
    reason: optionalClinicalText,
    diagnosis: optionalClinicalText,
    treatment: optionalClinicalText,
    observations: optionalClinicalText,
    indications: optionalClinicalText,
    toothNumbers: z
      .array(z.number())
      .refine(
        (numbers) => numbers.every((number) => Number.isInteger(number) && FDI_SET.has(number)),
        { message: 'Diente FDI inválido.' },
      )
      .refine((numbers) => new Set(numbers).size === numbers.length, {
        message: 'No repitas el mismo diente.',
      })
      .optional(),
  })
  .refine(
    (value) =>
      [value.reason, value.diagnosis, value.treatment, value.observations, value.indications].some(
        (field) => field !== null && field !== undefined && field.trim() !== '',
      ),
    {
      message:
        'Completá al menos un dato clínico: motivo, diagnóstico, tratamiento, observaciones o indicaciones.',
      path: ['form'],
    },
  );
export type CreateClinicalRecordInput = z.infer<typeof createClinicalRecordSchema>;
