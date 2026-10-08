import { describe, expect, it } from 'vitest';
import { createPatientSchema, listPatientsQuerySchema, updatePatientSchema } from './patient';

describe('createPatientSchema', () => {
  const valid = {
    firstName: 'María',
    lastName: 'González',
    dni: '30712345',
  };

  it('acepta el alta mínima (nombre, apellido y DNI)', () => {
    expect(createPatientSchema.safeParse(valid).success).toBe(true);
  });

  it('acepta el alta completa con campos opcionales vacíos', () => {
    const result = createPatientSchema.safeParse({
      ...valid,
      birthDate: '1990-05-20',
      phone: '11 4444-5555',
      email: 'maria@example.com',
      address: 'Av. Siempreviva 742',
      locality: 'La Plata',
      province: 'Buenos Aires',
      emergencyContact: 'Juan González (padre)',
      healthInsurer: 'OSDE',
      memberNumber: '123456',
      allergies: 'Penicilina',
      medications: 'Ninguna',
      background: 'Sin antecedentes',
      notes: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.birthDate).toBe('1990-05-20');
      expect(result.data.notes).toBe('');
    }
  });

  it('rechaza nombre, apellido o DNI faltantes/inválidos', () => {
    expect(createPatientSchema.safeParse({ ...valid, firstName: 'M' }).success).toBe(false);
    expect(createPatientSchema.safeParse({ ...valid, lastName: '' }).success).toBe(false);
    expect(createPatientSchema.safeParse({ ...valid, dni: '12' }).success).toBe(false);
    expect(createPatientSchema.safeParse({ lastName: 'González', dni: '30712345' }).success).toBe(
      false,
    );
  });

  it('rechaza email o fecha inválidos cuando se envían', () => {
    expect(createPatientSchema.safeParse({ ...valid, email: 'no-es-email' }).success).toBe(false);
    expect(createPatientSchema.safeParse({ ...valid, birthDate: '20/05/1990' }).success).toBe(
      false,
    );
    // Vacío está permitido (se normaliza a null en el backend).
    expect(createPatientSchema.safeParse({ ...valid, email: '', birthDate: '' }).success).toBe(
      true,
    );
  });
});

describe('updatePatientSchema', () => {
  it('acepta ediciones parciales', () => {
    expect(updatePatientSchema.safeParse({ phone: '11 5555-4444' }).success).toBe(true);
    expect(updatePatientSchema.safeParse({ dni: '30712345' }).success).toBe(true);
  });

  it('rechaza actualizaciones vacías y datos inválidos', () => {
    expect(updatePatientSchema.safeParse({}).success).toBe(false);
    expect(updatePatientSchema.safeParse({ email: 'mal' }).success).toBe(false);
  });
});

describe('listPatientsQuerySchema', () => {
  it('acepta búsqueda y estado válidos', () => {
    expect(listPatientsQuerySchema.safeParse({ query: 'gonzalez' }).success).toBe(true);
    expect(listPatientsQuerySchema.safeParse({ status: 'ARCHIVADO' }).success).toBe(true);
    expect(listPatientsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('rechaza estados fuera de ACTIVO/ARCHIVADO', () => {
    expect(listPatientsQuerySchema.safeParse({ status: 'BORRADO' }).success).toBe(false);
  });
});
