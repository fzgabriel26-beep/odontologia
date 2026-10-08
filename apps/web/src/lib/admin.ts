import type { InvitationStatus } from '@odonto/types';

/** Fila de usuario del panel administrativo (GET /users, sin hash). */
export interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  dni: string;
  email: string;
  role: { key: string; name: string };
  status: 'ACTIVO' | 'INACTIVO';
  lastLoginAt: string | null;
  createdAt: string;
}

/** Fila de código de invitación (GET /invitation-codes). */
export interface InvitationCodeRow {
  id: string;
  code: string;
  role: { key: string; name: string };
  /** Estado persistido en base. */
  status: InvitationStatus;
  /** Estado calculado para la UI (DISPONIBLE vencido → EXPIRADO). */
  displayStatus: InvitationStatus;
  expiresAt: string | null;
  revokedAt: string | null;
  usedAt: string | null;
  createdBy: { firstName: string; lastName: string } | null;
  usedBy: { firstName: string; lastName: string } | null;
  createdAt: string;
}

/** Fecha corta en español (dd/mm/aaaa) o guion si no hay dato. */
export function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Fecha y hora local en español, o guion si no hay dato. */
export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
