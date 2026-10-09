'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AUDIT_ACTION_LABELS, AUDIT_ACTIONS } from '@odonto/types';
import { apiFetch } from '@/lib/api';
import { type AdminUser } from '@/lib/admin';
import { AUDIT_PAGE_SIZE, type AuditListParams } from '@/lib/audit';
import { AuditList } from './audit-list';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';

interface FilterState {
  action: string;
  userId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: FilterState = { action: '', userId: '', from: '', to: '' };

function toParams(filters: FilterState): AuditListParams {
  return {
    limit: AUDIT_PAGE_SIZE,
    ...(filters.action !== '' ? { action: filters.action } : {}),
    ...(filters.userId !== '' ? { userId: filters.userId } : {}),
    ...(filters.from !== '' ? { from: filters.from } : {}),
    ...(filters.to !== '' ? { to: filters.to } : {}),
  };
}

/**
 * Panel de auditoría (SDD CU-15 / fase 9): filtros por acción, usuario y
 * rango de fechas sobre GET /audit. El listado lo provee AuditList.
 * Solo administradores (el backend exige audit.read).
 */
export function AuditPanel() {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<AuditListParams>(() => toParams(EMPTY_FILTERS));
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [usersError, setUsersError] = useState(false);

  // Combo de usuarios: requiere users.manage (lo tiene el admin junto a audit.read).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiFetch<AdminUser[]>('/users');
        if (!cancelled) setUsers(list);
      } catch {
        if (!cancelled) setUsersError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = (event: FormEvent): void => {
    event.preventDefault();
    setApplied(toParams(filters));
  };

  const reset = (): void => {
    setFilters(EMPTY_FILTERS);
    setApplied(toParams(EMPTY_FILTERS));
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={apply}
        className="grid gap-4 rounded-md border bg-background p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="space-y-2">
          <Label htmlFor="audit-action">Acción</Label>
          <NativeSelect
            id="audit-action"
            value={filters.action}
            onChange={(event) => setFilters({ ...filters, action: event.target.value })}
          >
            <option value="">Todas las acciones</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {AUDIT_ACTION_LABELS[action]}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="audit-user">Usuario</Label>
          <NativeSelect
            id="audit-user"
            value={filters.userId}
            disabled={users === null}
            onChange={(event) => setFilters({ ...filters, userId: event.target.value })}
          >
            <option value="">Todos los usuarios</option>
            {users !== null
              ? users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.firstName} {user.lastName}
                  </option>
                ))
              : null}
          </NativeSelect>
          {usersError ? (
            <p className="text-xs text-muted-foreground">
              No se pudo cargar el listado de usuarios; el filtro de usuario queda deshabilitado.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="audit-from">Desde</Label>
          <Input
            id="audit-from"
            type="date"
            value={filters.from}
            onChange={(event) => setFilters({ ...filters, from: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="audit-to">Hasta</Label>
          <Input
            id="audit-to"
            type="date"
            value={filters.to}
            onChange={(event) => setFilters({ ...filters, to: event.target.value })}
          />
        </div>

        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Aplicar filtros</Button>
          <Button type="button" variant="outline" onClick={reset}>
            Limpiar
          </Button>
        </div>
      </form>

      <AuditList params={applied} />
    </div>
  );
}
