import { describe, expect, it } from 'vitest';
import {
  adminResetPasswordSchema,
  changeUserRoleSchema,
  changeUserStatusSchema,
  createInvitationCodeSchema,
  createUserSchema,
  updateUserSchema,
  uuidParamSchema,
} from './admin';

describe('createUserSchema', () => {
  const valid = {
    firstName: 'Juan',
    lastName: 'Pérez',
    dni: '30712345',
    email: 'juan@example.com',
    password: 'Consult10',
    roleKey: 'ODONTOLOGO' as const,
  };

  it('acepta un alta completa con rol válido', () => {
    expect(createUserSchema.safeParse(valid).success).toBe(true);
  });

  it('rechaza rol inexistente o datos faltantes', () => {
    expect(createUserSchema.safeParse({ ...valid, roleKey: 'SUPERVISOR' }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...valid, dni: '' }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...valid, password: '123' }).success).toBe(false);
  });
});

describe('updateUserSchema', () => {
  it('acepta edición parcial sin contraseña ni rol', () => {
    expect(updateUserSchema.safeParse({ firstName: 'María' }).success).toBe(true);
    expect(updateUserSchema.safeParse({}).success).toBe(true);
  });

  it('rechaza email inválido y DNI malo si se envían', () => {
    expect(updateUserSchema.safeParse({ email: 'no-email' }).success).toBe(false);
    expect(updateUserSchema.safeParse({ dni: '12' }).success).toBe(false);
  });
});

describe('estado, rol y reset de contraseña', () => {
  it('changeUserStatusSchema solo admite ACTIVO/INACTIVO', () => {
    expect(changeUserStatusSchema.safeParse({ status: 'ACTIVO' }).success).toBe(true);
    expect(changeUserStatusSchema.safeParse({ status: 'BLOQUEADO' }).success).toBe(false);
  });

  it('changeUserRoleSchema admite los 3 roles del sistema', () => {
    expect(changeUserRoleSchema.safeParse({ roleKey: 'ADMIN' }).success).toBe(true);
    expect(changeUserRoleSchema.safeParse({ roleKey: 'SECRETARIO' }).success).toBe(true);
    expect(changeUserRoleSchema.safeParse({ roleKey: 'OTRO' }).success).toBe(false);
  });

  it('adminResetPasswordSchema exige contraseña segura', () => {
    expect(adminResetPasswordSchema.safeParse({ password: 'Consult10' }).success).toBe(true);
    expect(adminResetPasswordSchema.safeParse({ password: '123' }).success).toBe(false);
  });
});

describe('createInvitationCodeSchema', () => {
  it('acepta rol con y sin expiración', () => {
    expect(createInvitationCodeSchema.safeParse({ roleKey: 'ODONTOLOGO' }).success).toBe(true);
    expect(
      createInvitationCodeSchema.safeParse({ roleKey: 'SECRETARIO', expiresInDays: 7 }).success,
    ).toBe(true);
    expect(
      createInvitationCodeSchema.safeParse({ roleKey: 'SECRETARIO', expiresInDays: null }).success,
    ).toBe(true);
  });

  it('rechaza expiraciones fuera de rango o no enteras', () => {
    expect(
      createInvitationCodeSchema.safeParse({ roleKey: 'ODONTOLOGO', expiresInDays: 0 }).success,
    ).toBe(false);
    expect(
      createInvitationCodeSchema.safeParse({ roleKey: 'ODONTOLOGO', expiresInDays: 366 }).success,
    ).toBe(false);
    expect(
      createInvitationCodeSchema.safeParse({ roleKey: 'ODONTOLOGO', expiresInDays: 1.5 }).success,
    ).toBe(false);
  });
});

describe('uuidParamSchema', () => {
  it('acepta UUID y rechaza texto arbitrario', () => {
    expect(uuidParamSchema.safeParse('a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10').success).toBe(true);
    expect(uuidParamSchema.safeParse('no-es-uuid').success).toBe(false);
  });
});
