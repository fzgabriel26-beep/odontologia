import { describe, expect, it } from 'vitest';
import { createClinicalRecordSchema, FDI_NUMBERS } from './clinical';

describe('createClinicalRecordSchema', () => {
  const valid = {
    date: '2026-10-08',
    time: '10:30',
    reason: 'Control de rutina',
    diagnosis: 'Caries oclusal',
    treatment: 'Restauración',
    toothNumbers: [36, 46],
  };

  it('acepta una evolución completa', () => {
    const result = createClinicalRecordSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toothNumbers).toEqual([36, 46]);
    }
  });

  it('acepta una evolución mínima con dientes ausentes (opcional)', () => {
    const result = createClinicalRecordSchema.safeParse({
      date: '2026-10-08',
      time: '09:00',
      reason: 'Solo motivo',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // El servicio normaliza la ausencia a [] antes de persistir.
      expect(result.data.toothNumbers).toBeUndefined();
    }
  });

  it('rechaza fecha u hora con formato inválido', () => {
    expect(createClinicalRecordSchema.safeParse({ ...valid, date: '08/10/2026' }).success).toBe(
      false,
    );
    expect(createClinicalRecordSchema.safeParse({ ...valid, date: '' }).success).toBe(false);
    expect(createClinicalRecordSchema.safeParse({ ...valid, time: '25:00' }).success).toBe(false);
    expect(createClinicalRecordSchema.safeParse({ ...valid, time: '9:05' }).success).toBe(false);
    expect(createClinicalRecordSchema.safeParse({ ...valid, time: '10:30:00' }).success).toBe(
      false,
    );
  });

  it('exige al menos un dato clínico con contenido', () => {
    const empty = createClinicalRecordSchema.safeParse({
      date: '2026-10-08',
      time: '10:30',
      reason: '',
      diagnosis: '   ',
    });
    expect(empty.success).toBe(false);
    if (!empty.success) {
      const formIssue = empty.error.issues.find((issue) => issue.path.join('.') === 'form');
      expect(formIssue).toBeDefined();
    }
  });

  it('valida la numeración FDI (permanentes y temporales)', () => {
    // Válidos: un permanente, un temporal y el límite del conjunto.
    expect(
      createClinicalRecordSchema.safeParse({ ...valid, toothNumbers: [11, 51, 85] }).success,
    ).toBe(true);
    expect(FDI_NUMBERS).toHaveLength(52);

    // Inválidos: fuera de la tabla FDI, decimal y repetido.
    expect(createClinicalRecordSchema.safeParse({ ...valid, toothNumbers: [19] }).success).toBe(
      false,
    );
    expect(createClinicalRecordSchema.safeParse({ ...valid, toothNumbers: [99] }).success).toBe(
      false,
    );
    expect(createClinicalRecordSchema.safeParse({ ...valid, toothNumbers: [36.5] }).success).toBe(
      false,
    );
    expect(createClinicalRecordSchema.safeParse({ ...valid, toothNumbers: [36, 36] }).success).toBe(
      false,
    );
  });

  it('permite campos clínicos vacíos opcionales', () => {
    const result = createClinicalRecordSchema.safeParse({
      ...valid,
      diagnosis: '',
      treatment: null,
      observations: 'Nota libre',
      indications: undefined,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.diagnosis).toBe('');
      expect(result.data.observations).toBe('Nota libre');
    }
  });
});
