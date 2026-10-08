import { z } from 'zod';
import { FILE_KINDS } from '@odonto/types';

/**
 * Esquemas de archivos médicos (SDD, fase 7 / CU-10).
 * Valida los campos de texto del multipart; el binario se valida en el
 * backend con extensión (whitelist), tamaño (MAX_UPLOAD_MB) y magic bytes.
 */

/** Tipo/kind de archivo (los 6 del SDD, enum compartido frontend/backend). */
export const fileKindSchema = z.enum(FILE_KINDS, {
  message: 'Elegí un tipo de archivo válido.',
});

/**
 * Campos del multipart de subida a nivel paciente: `toothId` opcional para
 * asociar el archivo a un diente ('' del formulario → sin diente).
 */
export const uploadFileFieldsSchema = z.object({
  kind: fileKindSchema,
  description: z.string().trim().nullish(),
  toothId: z.union([z.literal(''), z.uuid({ message: 'Diente inválido.' })]).optional(),
});
export type UploadFileFieldsInput = z.infer<typeof uploadFileFieldsSchema>;

/** Campos del multipart de subida a un diente (CU-10): el diente viene en la ruta. */
export const uploadToToothFieldsSchema = z.object({
  kind: fileKindSchema,
  description: z.string().trim().nullish(),
});
export type UploadToToothFieldsInput = z.infer<typeof uploadToToothFieldsSchema>;
