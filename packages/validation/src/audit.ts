import { z } from 'zod';
import { AUDIT_ACTIONS } from '@odonto/types';
import { dateOnlySchema } from './appointments';

/**
 * Filtros del panel de auditoría (SDD CU-15 / §9 / fase 9):
 * acción, usuario, paciente, rango de fechas y paginación.
 * Solo lectura: el registro es insert-only y no admite altas ni bajas.
 */
export const auditQuerySchema = z
  .object({
    action: z.enum(AUDIT_ACTIONS, { message: 'Acción de auditoría inválida.' }).optional(),
    userId: z.uuid({ message: 'Usuario inválido.' }).optional(),
    patientId: z.uuid({ message: 'Paciente inválido.' }).optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    limit: z.coerce
      .number({ message: 'Límite inválido.' })
      .int('El límite debe ser un número entero.')
      .min(1, 'El límite mínimo es 1.')
      .max(500, 'El límite máximo es 500.')
      .optional(),
    offset: z.coerce
      .number({ message: 'Desplazamiento inválido.' })
      .int('El desplazamiento debe ser un número entero.')
      .min(0, 'El desplazamiento no puede ser negativo.')
      .max(1_000_000, 'Desplazamiento demasiado grande.')
      .optional(),
  })
  .refine((value) => value.from === undefined || value.to === undefined || value.from <= value.to, {
    message: 'El rango de fechas es inválido: "desde" debe ser anterior o igual a "hasta".',
    path: ['from'],
  });

export type AuditQueryInput = z.infer<typeof auditQuerySchema>;
