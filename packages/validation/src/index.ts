/**
 * Esquemas Zod compartidos entre frontend y backend.
 *
 * SDD §4.1 y ADR-002: la misma regla de validación se ejecuta en el
 * formulario (React Hook Form + zodResolver) y en el pipe de NestJS.
 * Cada fase agrega aquí los esquemas de su módulo.
 */
export { dniSchema, isValidDni, normalizeDni } from './dni';
export { PASSWORD_POLICY_MESSAGE, emailSchema, passwordSchema } from './password';
export {
  changePasswordSchema,
  forgotPasswordSchema,
  invitationCodeSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth';
export type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from './auth';
export {
  adminResetPasswordSchema,
  changeUserRoleSchema,
  changeUserStatusSchema,
  createInvitationCodeSchema,
  createUserSchema,
  roleKeySchema,
  updateUserSchema,
  uuidParamSchema,
} from './admin';
export type {
  AdminResetPasswordInput,
  ChangeUserRoleInput,
  ChangeUserStatusInput,
  CreateInvitationCodeInput,
  CreateUserInput,
  UpdateUserInput,
} from './admin';
export { createPatientSchema, listPatientsQuerySchema, updatePatientSchema } from './patient';
export type { CreatePatientInput, ListPatientsQueryInput, UpdatePatientInput } from './patient';
export { createClinicalRecordSchema, FDI_NUMBERS } from './clinical';
export type { CreateClinicalRecordInput } from './clinical';
