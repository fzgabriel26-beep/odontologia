import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Estado de auditoría de la request actual (fase 9 / ADR-014).
 *
 * El `AuditInterceptor` abre este contexto antes de ejecutar el handler y, al
 * finalizar, comprueba si alguien dejó una fila de auditoría. Los servicios la
 * marcan con `markAuditLogged()` desde `AuditService.log`. `AsyncLocalStorage`
 * propaga por la cadena async de la request sin tocar la firma de los servicios.
 */
interface AuditRequestState {
  audited: boolean;
}

const storage = new AsyncLocalStorage<AuditRequestState>();

/** Ejecuta `fn` con estado de auditoría compartido durante toda la request. */
export function runWithAuditState<T>(fn: () => T): T {
  return storage.run({ audited: false }, fn);
}

/** Marca que la request actual ya produjo una fila de auditoría de dominio. */
export function markAuditLogged(): void {
  const state = storage.getStore();
  if (state) {
    state.audited = true;
  }
}

/** true si la request actual ya dejó una fila de auditoría explícita. */
export function isAuditLogged(): boolean {
  return storage.getStore()?.audited ?? false;
}
