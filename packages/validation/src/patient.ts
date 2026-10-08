import { z } from 'zod';
import { dniSchema } from './dni';
import { emailSchema } from './password';

/**
 * Esquemas de pacientes (SDD, fase 4 / CU-06 y CU-07).
 * DNI obligatorio y único; el resto de los datos son opcionales ('' se
 * normaliza a null en el servicio antes de persistir).
 */

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label}: máximo ${max} caracteres.`).nullish();

/** Texto libre sin límite de longitud (antecedentes, observaciones). */
const optionalLongText = z.string().trim().nullish();

/** Email opcional: acepta vacío (formulario sin completar). */
const optionalEmail = z.union([z.literal(''), emailSchema]).nullish();

/** Fecha ISO (aaaa-mm-dd) opcional, acepta vacío. */
const optionalDate = z
  .union([z.literal(''), z.iso.date({ message: 'Ingresá una fecha válida (aaaa-mm-dd).' })])
  .nullish();

export const createPatientSchema = z.object({
  firstName: z.string().trim().min(2, 'Ingresá el nombre.'),
  lastName: z.string().trim().min(2, 'Ingresá el apellido.'),
  dni: dniSchema,
  birthDate: optionalDate,
  phone: optionalText(50, 'Teléfono'),
  email: optionalEmail,
  address: optionalText(255, 'Dirección'),
  locality: optionalText(100, 'Localidad'),
  province: optionalText(100, 'Provincia'),
  emergencyContact: optionalText(255, 'Contacto de emergencia'),
  healthInsurer: optionalText(100, 'Obra social'),
  memberNumber: optionalText(100, 'N° de afiliado'),
  allergies: optionalLongText,
  medications: optionalLongText,
  background: optionalLongText,
  notes: optionalLongText,
});
export type CreatePatientInput = z.infer<typeof createPatientSchema>;

/** Edición de la ficha: mismo formulario, todos los campos opcionales y al menos uno. */
export const updatePatientSchema = createPatientSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'No hay datos para actualizar.',
    path: ['form'],
  });
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

/** Filtros de listado (CU-07: búsqueda por nombre, apellido, DNI, teléfono o email). */
export const listPatientsQuerySchema = z.object({
  query: z.string().trim().max(100, 'La búsqueda es demasiado larga.').optional(),
  status: z.enum(['ACTIVO', 'ARCHIVADO'], { message: 'Estado inválido.' }).optional(),
});
export type ListPatientsQueryInput = z.infer<typeof listPatientsQuerySchema>;
