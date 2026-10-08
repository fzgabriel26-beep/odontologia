import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, Logger } from '@nestjs/common';
import { maxUploadMb } from '../utils/upload-limit';

function statusToCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    default:
      return 'HTTP_ERROR';
  }
}

/**
 * Filtro global de errores (SDD §7 — manejo de errores):
 *  - Nunca expone errores técnicos al usuario (sin SQLSTATE, stack traces, etc.).
 *  - Mensajes en español; los detalles técnicos solo van al log interno.
 *  - No registra información clínica sensible.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status(code: number): { json(body: unknown): unknown };
      json(body: unknown): unknown;
    }>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      const raw =
        typeof body === 'string'
          ? body
          : ((body as Record<string, unknown>)?.message ?? 'La solicitud no pudo procesarse.');
      const message = Array.isArray(raw) ? 'Revisá los datos ingresados.' : String(raw);

      if (status === 429) {
        response.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Demasiados intentos. Esperá un minuto y volvé a intentar.',
          },
        });
        return;
      }

      // Límite de subida: multer emite LIMIT_FILE_SIZE y Nest lo convierte en
      // 413 antes de que llegue acá (texto original en inglés).
      if (status === 413) {
        response.status(413).json({
          error: {
            code: 'FILE_TOO_LARGE',
            message: `El archivo supera el máximo permitido de ${maxUploadMb()} MB.`,
          },
        });
        return;
      }

      // Campo de multipart distinto de 'file' (multer LIMIT_UNEXPECTED_FILE).
      if (status === 400 && message.startsWith('Unexpected field')) {
        response.status(400).json({
          error: {
            code: 'FILE_FIELD_INVALID',
            message: "El archivo debe enviarse en el campo 'file'.",
          },
        });
        return;
      }

      if (typeof body === 'object' && body !== null && 'error' in body) {
        response.status(status).json(body);
        return;
      }

      response.status(status).json({ error: { code: statusToCode(status), message } });
      return;
    }

    const stack = exception instanceof Error ? exception.stack : String(exception);

    // Errores de multer (multipart): nunca llegan como HttpException.
    if (exception instanceof Error && exception.name === 'MulterError') {
      const multerCode = (exception as unknown as { code?: unknown }).code;
      if (multerCode === 'LIMIT_FILE_SIZE') {
        response.status(400).json({
          error: {
            code: 'FILE_TOO_LARGE',
            message: `El archivo supera el máximo permitido de ${maxUploadMb()} MB.`,
          },
        });
        return;
      }
      if (multerCode === 'LIMIT_UNEXPECTED_FILE') {
        response.status(400).json({
          error: {
            code: 'FILE_FIELD_INVALID',
            message: "El archivo debe enviarse en el campo 'file'.",
          },
        });
        return;
      }
      response.status(400).json({
        error: { code: 'UPLOAD_INVALID', message: 'La subida del archivo no es válida.' },
      });
      return;
    }

    this.logger.error('Error no controlado', stack);
    response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'No fue posible procesar la solicitud. Intentá nuevamente.',
      },
    });
  }
}
