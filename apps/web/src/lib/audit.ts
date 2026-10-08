import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, type AuditAction } from '@odonto/types';
import { apiFetch } from './api';

/** Fila del historial de auditoría (misma forma que devuelve GET /audit). */
export interface AuditEntry {
  id: string;
  userId: string | null;
  user: { id: string; firstName: string; lastName: string } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface AuditListParams {
  action?: string;
  userId?: string;
  patientId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** Registros por página del panel (el backend admite hasta 500). */
export const AUDIT_PAGE_SIZE = 50;

/** Etiqueta en español de la acción (si es desconocida, el código crudo). */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
}

/** Etiqueta en español de la entidad afectada (fallback: el código crudo). */
export function auditEntityLabel(entityType: string): string {
  return AUDIT_ENTITY_LABELS[entityType] ?? entityType;
}

/** Autor de la fila: nombre completo, "Usuario eliminado" o "Sistema". */
export function auditActorLabel(entry: AuditEntry): string {
  if (entry.user) return `${entry.user.firstName} ${entry.user.lastName}`;
  return entry.userId !== null ? 'Usuario eliminado' : 'Sistema';
}

/** Consulta el historial con los filtros indicados (solo audit.read). */
export async function listAuditEntries(params: AuditListParams = {}): Promise<AuditEntry[]> {
  const search = new URLSearchParams();
  if (params.action !== undefined) search.set('action', params.action);
  if (params.userId !== undefined) search.set('userId', params.userId);
  if (params.patientId !== undefined) search.set('patientId', params.patientId);
  if (params.from !== undefined) search.set('from', params.from);
  if (params.to !== undefined) search.set('to', params.to);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  const queryString = search.toString();
  return apiFetch<AuditEntry[]>(`/audit${queryString ? `?${queryString}` : ''}`);
}
