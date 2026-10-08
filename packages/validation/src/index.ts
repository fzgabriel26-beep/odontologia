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
export { createToothEventSchema, toothStatusSchema, updateToothSchema } from './odontogram';
export type { CreateToothEventInput, UpdateToothInput } from './odontogram';
export { fileKindSchema, uploadFileFieldsSchema, uploadToToothFieldsSchema } from './files';
export type { UploadFileFieldsInput, UploadToToothFieldsInput } from './files';
export {
  appointmentListQuerySchema,
  appointmentStatsQuerySchema,
  appointmentStatusSchema,
  changeAppointmentStatusSchema,
  createAppointmentSchema,
  dateOnlySchema,
  paymentMethodSchema,
  registerSignaSchema,
  timeOnlySchema,
  updateAppointmentSchema,
} from './appointments';
export type {
  AppointmentListQueryInput,
  AppointmentStatsQueryInput,
  ChangeAppointmentStatusInput,
  CreateAppointmentInput,
  RegisterSignaInput,
  UpdateAppointmentInput,
} from './appointments';
export { auditQuerySchema } from './audit';
export type { AuditQueryInput } from './audit';
