import { describe, expect, it } from 'vitest';
import { uploadFileFieldsSchema, uploadToToothFieldsSchema } from './files';

const uuid = '3f1c9d21-b4e1-4f6a-8c9d-0e2f4a6b8c10';

describe('uploadFileFieldsSchema', () => {
  it('acepta los campos completos con diente asociado', () => {
    const result = uploadFileFieldsSchema.safeParse({
      kind: 'RADIOGRAFIA',
      description: 'Panorámica inicial',
      toothId: uuid,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('RADIOGRAFIA');
      expect(result.data.toothId).toBe(uuid);
    }
  });

  it('acepta el mínimo (solo kind; toothId vacío queda como sin diente)', () => {
    const minimal = uploadFileFieldsSchema.safeParse({ kind: 'PDF' });
    expect(minimal.success).toBe(true);
    if (minimal.success) {
      expect(minimal.success && minimal.data.toothId).toBeUndefined();
      expect(minimal.data.description).toBeUndefined();
    }
    const emptyTooth = uploadFileFieldsSchema.safeParse({ kind: 'PDF', toothId: '' });
    expect(emptyTooth.success).toBe(true);
    if (emptyTooth.success) {
      expect(emptyTooth.data.toothId).toBe('');
    }
  });

  it('rechaza un kind fuera de la lista con mensaje en español', () => {
    const result = uploadFileFieldsSchema.safeParse({ kind: 'VIDEO' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((issue) => issue.path.join('.') === 'kind');
      expect(issue?.message).toBe('Elegí un tipo de archivo válido.');
    }
    expect(uploadFileFieldsSchema.safeParse({}).success).toBe(false);
  });

  it('rechaza toothId o description con tipos inválidos', () => {
    expect(uploadFileFieldsSchema.safeParse({ kind: 'PDF', toothId: 'no-uuid' }).success).toBe(
      false,
    );
    expect(uploadFileFieldsSchema.safeParse({ kind: 'PDF', toothId: 42 }).success).toBe(false);
    expect(uploadFileFieldsSchema.safeParse({ kind: 'PDF', description: 7 }).success).toBe(false);
  });
});

describe('uploadToToothFieldsSchema', () => {
  it('acepta kind solo o con descripción y no admite toothId', () => {
    expect(uploadToToothFieldsSchema.safeParse({ kind: 'ESTUDIO' }).success).toBe(true);
    expect(
      uploadToToothFieldsSchema.safeParse({ kind: 'ESTUDIO', description: 'Placa' }).success,
    ).toBe(true);
    expect(uploadToToothFieldsSchema.safeParse({ kind: 'NO' }).success).toBe(false);
    expect(uploadToToothFieldsSchema.safeParse({}).success).toBe(false);
    expect(uploadToToothFieldsSchema.safeParse({ kind: 'ESTUDIO', description: 1 }).success).toBe(
      false,
    );
  });
});
