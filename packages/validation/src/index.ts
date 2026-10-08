/**
 * Esquemas Zod compartidos entre frontend y backend.
 *
 * SDD §4.1 y ADR-002: la misma regla de validación se ejecuta en el
 * formulario (React Hook Form + zodResolver) y en el pipe de NestJS.
 * Cada fase agrega aquí los esquemas de su módulo.
 */
export { dniSchema, isValidDni, normalizeDni } from './dni';
