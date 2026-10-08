import { describe, expect, it } from 'vitest';
import { dniSchema, isValidDni, normalizeDni } from './dni';

describe('dniSchema', () => {
  it('acepta un DNI de 8 dígitos', () => {
    const result = dniSchema.safeParse('30712345');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('30712345');
  });

  it('acepta un DNI de 7 dígitos', () => {
    expect(isValidDni('1234567')).toBe(true);
  });

  it('acepta DNI con puntos y los normaliza', () => {
    const result = dniSchema.safeParse('30.123.456');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('30123456');
  });

  it('rechaza el DNI vacío', () => {
    expect(isValidDni('')).toBe(false);
  });

  it('rechaza DNI con letras', () => {
    expect(isValidDni('abc12345')).toBe(false);
  });

  it('rechaza DNI muy corto', () => {
    expect(isValidDni('12345')).toBe(false);
  });

  it('rechaza DNI muy largo', () => {
    expect(isValidDni('123456789')).toBe(false);
  });
});

describe('normalizeDni', () => {
  it('quita puntos y espacios', () => {
    expect(normalizeDni(' 30. 123.456 ')).toBe('30123456');
  });
});
