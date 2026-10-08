import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { uuidParamSchema } from '@odonto/validation';

/** Valida IDs UUID de parámetros de ruta antes de tocar la base. */
export class UuidParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const result = uuidParamSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        error: { code: 'INVALID_ID', message: 'Identificador inválido.' },
      });
    }
    return result.data;
  }
}
