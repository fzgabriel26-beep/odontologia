import { describe, expect, it } from 'vitest';
import { createToothEventSchema, updateToothSchema } from './odontogram';

describe('createToothEventSchema', () => {
  it('acepta un evento completo', () => {
    const result = createToothEventSchema.safeParse({
      status: 'CARIES',
      note: 'Lesión oclusal',
      eventDate: '2026-10-08',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('CARIES');
    }
  });

  it('acepta el mínimo (solo el estado; la fecha es opcional)', () => {
    const result = createToothEventSchema.safeParse({ status: 'ENDODONCIA' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eventDate).toBeUndefined();
      expect(result.data.note).toBeUndefined();
    }
  });

  it('rechaza un estado fuera de la lista con mensaje en español', () => {
    const result = createToothEventSchema.safeParse({ status: 'NO_EXISTE' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((issue) => issue.path.join('.') === 'status');
      expect(issue?.message).toBe('Estado dental inválido.');
    }
    // Un valor fuera del enum tampoco pasa con string vacío.
    expect(createToothEventSchema.safeParse({ status: '' }).success).toBe(false);
  });

  it('rechaza fecha con formato inválido y nota no textual', () => {
    expect(
      createToothEventSchema.safeParse({ status: 'SANO', eventDate: '08/10/2026' }).success,
    ).toBe(false);
    expect(createToothEventSchema.safeParse({ status: 'SANO', eventDate: '' }).success).toBe(false);
    expect(createToothEventSchema.safeParse({ status: 'SANO', note: 42 }).success).toBe(false);
  });
});

describe('updateToothSchema', () => {
  it('acepta observaciones como texto o null (limpiar)', () => {
    expect(
      updateToothSchema.safeParse({ observations: '  Molar con restauración previa  ' }).success,
    ).toBe(true);
    expect(updateToothSchema.safeParse({ observations: null }).success).toBe(true);
    expect(updateToothSchema.safeParse({ observations: '' }).success).toBe(true);
  });

  it('exige al menos un campo presente (path form)', () => {
    const result = updateToothSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((issue) => issue.path.join('.') === 'form');
      expect(issue?.message).toBe('No hay datos para actualizar.');
    }
  });

  it('rechaza observaciones no textuales', () => {
    expect(updateToothSchema.safeParse({ observations: 123 }).success).toBe(false);
  });
});
