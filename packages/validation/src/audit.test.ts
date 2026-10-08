import { describe, expect, it } from 'vitest';
import { auditQuerySchema } from './audit';

function fieldOf(
  result: ReturnType<typeof auditQuerySchema.safeParse>,
  path: string,
): string | undefined {
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path.join('.') === path)?.message;
}

const userId = '3f1c9d21-b4e1-4f6a-8c9d-0e2f4a6b8c10';
const patientId = '4a2d8e32-c5f1-4b7e-9d0a-1f3b5c7d9e11';

describe('auditQuerySchema', () => {
  it('acepta la consulta vacía (lista los últimos registros)', () => {
    const result = auditQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({});
  });

  it('acepta la combinación completa de filtros', () => {
    const result = auditQuerySchema.safeParse({
      action: 'PATIENT_UPDATED',
      userId,
      patientId,
      from: '2026-10-01',
      to: '2026-10-31',
      limit: '100',
      offset: '50',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe('PATIENT_UPDATED');
      expect(result.data.limit).toBe(100); // coerce de query string a número
      expect(result.data.offset).toBe(50);
    }
  });

  it('rechaza acciones que no existen en AUDIT_ACTIONS', () => {
    const result = auditQuerySchema.safeParse({ action: 'BORRAR_TODO' });
    expect(result.success).toBe(false);
    expect(fieldOf(result, 'action')).toBe('Acción de auditoría inválida.');
  });

  it('rechaza userId o patientId que no sean uuid', () => {
    expect(auditQuerySchema.safeParse({ userId: 'no-uuid' }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ patientId: '123' }).success).toBe(false);
  });

  it('rechaza fechas fuera del formato aaaa-mm-dd', () => {
    const result = auditQuerySchema.safeParse({ from: 'ayer' });
    expect(result.success).toBe(false);
    expect(fieldOf(result, 'from')).toBe('Ingresá una fecha válida (aaaa-mm-dd).');
  });

  it('rechaza un rango invertido (desde > hasta)', () => {
    const result = auditQuerySchema.safeParse({ from: '2026-10-31', to: '2026-10-01' });
    expect(result.success).toBe(false);
    expect(fieldOf(result, 'from')).toContain('"desde" debe ser anterior');
  });

  it('valida los límites de paginación', () => {
    expect(auditQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ limit: '501' }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ limit: '2.5' }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ limit: '500', offset: '0' }).success).toBe(true);
  });
});
