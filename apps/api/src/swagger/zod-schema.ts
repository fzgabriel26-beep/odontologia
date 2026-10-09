import type { SchemaObject } from '@nestjs/swagger';
import { z, type ZodType } from 'zod';

/**
 * Convierte un schema Zod a JSON Schema (OpenAPI 3.0) para los decoradores de
 * `@nestjs/swagger` (SDD §9, fase 12).
 *
 * Los schemas de `@odonto/validation` son la única fuente de verdad de los
 * inputs de la API: los mismos que aplica `ZodValidationPipe` en runtime, así
 * que la documentación nunca puede divergir de lo que se valida.
 */
export function zodToSchema(schema: ZodType, io: 'input' | 'output' = 'input'): SchemaObject {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io }) as SchemaObject;
}

/** Envoltorio de array para respuestas tipo lista. */
export function arrayOf(items: SchemaObject): SchemaObject {
  return { type: 'array', items };
}
