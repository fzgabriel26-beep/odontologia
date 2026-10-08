import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Valida el body de la request con un esquema Zod compartido (ADR-002).
 * Responde400 con mensajes en español y detalle por campo (sin errores técnicos).
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || 'form';
        if (!fields[key]) {
          fields[key] = issue.message;
        }
      }
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Revisá los datos ingresados.',
          fields,
        },
      });
    }
    return result.data;
  }
}
