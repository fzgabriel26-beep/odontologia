/** Mensaje de correo electrónico (ADR-005: sin proveedor real en el MVP). */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Interfaz de envío de correos. En el MVP solo existe la implementación
 * stub (LogMailProvider); un proveedor real (SMTP, SendGrid, etc.) se
 * agrega luego sin tocar la lógica de autenticación.
 */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_PROVIDER = 'MAIL_PROVIDER';
