import { Injectable } from '@nestjs/common';
import type { MailMessage, MailProvider } from './mail.provider';

/**
 * Implementación stub de MailProvider (ADR-005): no envía correos
 * ni usa credenciales de terceros. Registra el mensaje en el log interno
 * para poder completar el flujo de recuperación en desarrollo.
 */
@Injectable()
export class LogMailProvider implements MailProvider {
  async send(message: MailMessage): Promise<void> {
    // Log interno de desarrollo: el MVP no integra proveedores de email.
    console.warn(`[MailProvider:stub] para=${message.to} asunto="${message.subject}"`);
    console.warn(message.text);
  }
}
