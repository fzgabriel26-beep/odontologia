import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  invitationCodeSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth';
import { passwordSchema } from './password';

describe('passwordSchema', () => {
  it('acepta una contraseña segura', () => {
    expect(passwordSchema.safeParse('Consult10').success).toBe(true);
  });

  it('rechaza contraseñas cortas, sin mayúscula, sin número', () => {
    expect(passwordSchema.safeParse('Cons1').success).toBe(false);
    expect(passwordSchema.safeParse('consultorio1').success).toBe(false);
    expect(passwordSchema.safeParse('Consultorio').success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('acepta credenciales válidas y normaliza el email', () => {
    const result = loginSchema.safeParse({ email: ' Admin@Ejemplo.COM ', password: 'x' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('admin@ejemplo.com');
  });

  it('rechaza email inválido o contraseña vacía', () => {
    expect(loginSchema.safeParse({ email: 'no-es-email', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});

describe('invitationCodeSchema', () => {
  it('acepta y normaliza el formato ODONTO-XXXX-XXXX', () => {
    const result = invitationCodeSchema.safeParse('  odonto-8f4k-92xm ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('ODONTO-8F4K-92XM');
  });

  it('rechaza códigos con formato inválido', () => {
    expect(invitationCodeSchema.safeParse('12345').success).toBe(false);
    expect(invitationCodeSchema.safeParse('ODONTO-8F4K').success).toBe(false);
    expect(invitationCodeSchema.safeParse('').success).toBe(false);
  });
});

describe('registerSchema', () => {
  const valid = {
    firstName: 'María',
    lastName: 'Pérez',
    dni: '30712345',
    email: 'maria@example.com',
    password: 'Consult10',
    invitationCode: 'ODONTO-8F4K-92XM',
  };

  it('acepta un registro completo', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('rechaza el registro sin DNI o con datos faltantes', () => {
    expect(registerSchema.safeParse({ ...valid, dni: '' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, invitationCode: '' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: '123' }).success).toBe(false);
  });
});

describe('restablecer / cambiar contraseña', () => {
  it('resetPasswordSchema exige token y contraseña segura', () => {
    expect(resetPasswordSchema.safeParse({ token: 'abc', password: 'Consult10' }).success).toBe(
      true,
    );
    expect(resetPasswordSchema.safeParse({ token: '', password: 'Consult10' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: 'abc', password: 'débil' }).success).toBe(false);
  });

  it('forgotPasswordSchema exige email válido', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.com' }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: 'x' }).success).toBe(false);
  });

  it('changePasswordSchema exige contraseña actual y nueva segura', () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'Consult10' }).success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'Consult10' }).success,
    ).toBe(false);
  });
});
