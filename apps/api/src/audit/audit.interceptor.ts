import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { concatMap, from, map, Observable, of, type Subscription } from 'rxjs';
import { isAuditLogged, runWithAuditState } from './audit-context';
import { AuditService } from './audit.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface MutationRequest {
  method: string;
  url?: string;
  ip?: string;
  user?: { id: string };
}

interface MutationResponse {
  statusCode: number;
}

/**
 * Red de seguridad de auditoría (SDD fase 9 / ADR-014).
 *
 * Toda mutación HTTP (POST/PUT/PATCH/DELETE) que responda 2xx sin haber
 * dejado una fila de auditoría de dominio genera una fila `API_MUTATION` con
 * método y ruta técnica (sin query: ahí puede haber texto del usuario). El
 * interceptor espera la escritura antes de responder; si el handler ya
 * auditó, no duplica. Los errores no generan fila: los fallos relevantes
 * (LOGIN_FAILED, etc.) ya tienen su propia auditoría explícita.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<MutationRequest>();
    if (!MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    // El subscribe debe ocurrir dentro del contexto ALS: recién ahí se ejecuta
    // el handler y toda su cadena async hereda el estado de la request.
    return new Observable<unknown>((subscriber) => {
      let subscription: Subscription | undefined;
      runWithAuditState(() => {
        subscription = next
          .handle()
          .pipe(concatMap((value: unknown) => this.fallbackIfNeeded(context, request, value)))
          .subscribe(subscriber);
      });
      return () => subscription?.unsubscribe();
    });
  }

  /** Escribe la fila `API_MUTATION` (y recién entonces emite) si hace falta. */
  private fallbackIfNeeded(
    context: ExecutionContext,
    request: MutationRequest,
    value: unknown,
  ): Observable<unknown> {
    if (isAuditLogged()) {
      return of(value);
    }
    const response = context.switchToHttp().getResponse<MutationResponse>();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return of(value);
    }
    const path = (request.url ?? '').split('?')[0] ?? '';
    return from(
      this.audit.log({
        userId: request.user?.id ?? null,
        action: 'API_MUTATION',
        entityType: 'API',
        metadata: { method: request.method, path },
        ip: request.ip,
      }),
    ).pipe(
      // AuditService.log nunca rechaza: la respuesta no depende del resultado.
      map(() => value),
    );
  }
}
