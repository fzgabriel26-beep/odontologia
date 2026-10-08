'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/admin';
import {
  AUDIT_PAGE_SIZE,
  auditActionLabel,
  auditActorLabel,
  auditEntityLabel,
  listAuditEntries,
  type AuditEntry,
  type AuditListParams,
} from '@/lib/audit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/** Acciones que se resaltan como peligrosas o negativas en la lista. */
const DESTRUCTIVE_ACTIONS = new Set([
  'LOGIN_FAILED',
  'PATIENT_ARCHIVED',
  'CLINICAL_RECORD_ARCHIVED',
  'FILE_ARCHIVED',
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_ABSENT_REGISTERED',
  'INVITATION_CODE_REVOKED',
  'API_MUTATION',
]);

/** Acciones administrativas delicadas (reset, cambio de rol/estado). */
const WARNING_ACTIONS = new Set([
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_BY_ADMIN',
  'USER_STATUS_CHANGED',
  'USER_ROLE_CHANGED',
]);

/** Tono del badge según la naturaleza de la acción. */
function auditActionTone(action: string): BadgeTone {
  if (DESTRUCTIVE_ACTIONS.has(action)) return 'destructive';
  if (WARNING_ACTIONS.has(action)) return 'warning';
  return 'info';
}

/** Fila individual: acción, entidad, autor, fecha, IP y metadatos desplegables. */
function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  return (
    <li className="rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={auditActionTone(entry.action)}>{auditActionLabel(entry.action)}</Badge>
          <span className="text-xs text-muted-foreground">{auditEntityLabel(entry.entityType)}</span>
        </div>
        <span className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
      </div>
      <p className="mt-1 break-all text-xs text-muted-foreground">
        {auditActorLabel(entry)}
        {entry.entityId !== null ? ` · Ref ${entry.entityId.slice(0, 8)}` : ''}
        {entry.ip !== null ? ` · IP ${entry.ip}` : ''}
      </p>
      {entry.metadata !== null ? (
        <details className="mt-2">
          <summary className="cursor-pointer select-none text-xs text-muted-foreground">
            Detalles
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </details>
      ) : null}
    </li>
  );
}

/**
 * Listado de auditoría (fase 9): lo comparten el panel /auditoria y la
 * pestaña "Historial" de la ficha. Carga la primera página, muestra estados
 * de carga/error y permite paginar con "Cargar más".
 *
 * `params` debe ser estable entre renders (estado o useMemo): dispara la
 * recarga del listado cada vez que cambia.
 */
export function AuditList({ params }: { params: AuditListParams }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastBatchSize, setLastBatchSize] = useState(0);

  const limit = params.limit ?? AUDIT_PAGE_SIZE;

  const load = useCallback(async () => {
    setEntries(null);
    setError(null);
    setLastBatchSize(0);
    try {
      const rows = await listAuditEntries({ ...params, limit, offset: 0 });
      setEntries(rows);
      setLastBatchSize(rows.length);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'No se pudo cargar el historial de auditoría.',
      );
    }
  }, [params, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async (): Promise<void> => {
    if (!entries) return;
    setLoadingMore(true);
    try {
      const next = await listAuditEntries({ ...params, limit, offset: entries.length });
      setEntries([...entries, ...next]);
      setLastBatchSize(next.length);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'No se pudieron cargar más registros.',
      );
    } finally {
      setLoadingMore(false);
    }
  };

  if (error !== null && entries === null) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (entries === null) {
    return <p className="text-sm text-muted-foreground">Cargando historial…</p>;
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin registros para los filtros indicados.</p>;
  }

  return (
    <div className="space-y-3">
      {error !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <ul className="space-y-2">
        {entries.map((entry) => (
          <AuditEntryRow key={entry.id} entry={entry} />
        ))}
      </ul>
      {lastBatchSize >= limit ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? 'Cargando…' : 'Cargar más'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
