'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ROLE_LABELS, type Role } from '@odonto/types';
import { ApiError, apiFetch } from '@/lib/api';
import { formatDateTime, type AdminUser } from '@/lib/admin';
import { useAppSession } from '@/components/app-session';
import { CreateUserForm, EditUserForm, ResetPasswordDialog } from '@/components/admin/user-forms';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type FormMode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; user: AdminUser };

/**
 * Gestión de usuarios (SDD, fase 3 / CU-05): listado, alta, edición de datos,
 * rol, activar/desactivar y reset de contraseña. Todo se revalida en backend.
 */
export default function UsersPage() {
  const { user: sessionUser } = useAppSession();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormMode>({ kind: 'closed' });
  const [notice, setNotice] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<AdminUser | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<AdminUser[]>('/users');
      setUsers(list);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'No se pudo cargar el listado.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!users) return [];
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((row) =>
      [row.firstName, row.lastName, row.email, row.dni].join(' ').toLowerCase().includes(term),
    );
  }, [users, search]);

  const closeForm = (): void => setForm({ kind: 'closed' });

  const onCreated = (): void => {
    setNotice('Usuario creado correctamente.');
    closeForm();
    void load();
  };

  const onSaved = (): void => {
    setNotice('Cambios guardados.');
    closeForm();
    void load();
  };

  const onReset = (): void => {
    setNotice('Contraseña restablecida. Se cerraron las sesiones del usuario.');
    void load();
  };

  const toggleStatus = async (target: AdminUser): Promise<void> => {
    const status = target.status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    await apiFetch<AdminUser>(`/users/${target.id}/status`, {
      method: 'POST',
      body: { status },
    });
    setNotice(
      status === 'INACTIVO'
        ? `${target.firstName} ${target.lastName} fue desactivado.`
        : `${target.firstName} ${target.lastName} fue reactivado.`,
    );
    await load();
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Cuentas del personal, roles y estados (CU-05).
          </p>
        </div>
        <Button onClick={() => setForm({ kind: 'create' })} disabled={form.kind === 'create'}>
          Nuevo usuario
        </Button>
      </header>

      {notice ? (
        <Alert variant="success">
          <AlertTitle>Listo</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {form.kind === 'create' ? (
        <CreateUserForm onCancel={closeForm} onCreated={onCreated} />
      ) : null}
      {form.kind === 'edit' ? (
        <EditUserForm
          key={form.user.id}
          user={form.user}
          canChangeRole={form.user.id !== sessionUser?.id}
          onCancel={closeForm}
          onSaved={onSaved}
        />
      ) : null}

      <div className="space-y-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre, email o DNI…"
          aria-label="Buscar usuarios"
        />

        {users === null && !loadError ? (
          <p className="text-sm text-muted-foreground">Cargando usuarios…</p>
        ) : null}

        {users !== null && filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {users.length === 0
              ? 'Todavía no hay usuarios cargados.'
              : 'Ningún usuario coincide con la búsqueda.'}
          </p>
        ) : null}

        {filtered.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Usuario</th>
                  <th className="px-4 py-3 font-medium">DNI</th>
                  <th className="px-4 py-3 font-medium">Rol</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Último acceso</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const isSelf = row.id === sessionUser?.id;
                  return (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {row.firstName} {row.lastName}
                          {isSelf ? (
                            <span className="ml-2 text-xs text-muted-foreground">(vos)</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">{row.email}</p>
                      </td>
                      <td className="px-4 py-3">{row.dni}</td>
                      <td className="px-4 py-3">
                        {ROLE_LABELS[row.role.key as Role] ?? row.role.name}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={row.status === 'ACTIVO' ? 'success' : 'destructive'}>
                          {row.status === 'ACTIVO' ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateTime(row.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setNotice(null);
                              setForm({ kind: 'edit', user: row });
                            }}
                          >
                            Editar
                          </Button>
                          {!isSelf ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setNotice(null);
                                  setResetTarget(row);
                                }}
                              >
                                Contraseña
                              </Button>
                              <Button
                                variant={row.status === 'ACTIVO' ? 'destructive' : 'outline'}
                                size="sm"
                                onClick={() => {
                                  setNotice(null);
                                  setStatusTarget(row);
                                }}
                              >
                                {row.status === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
        title={statusTarget?.status === 'ACTIVO' ? 'Desactivar usuario' : 'Activar usuario'}
        description={
          statusTarget?.status === 'ACTIVO'
            ? `${statusTarget.firstName} ${statusTarget.lastName} dejará de poder iniciar sesión y se cerrarán sus sesiones activas.`
            : `${statusTarget?.firstName ?? ''} ${statusTarget?.lastName ?? ''} volverá a poder iniciar sesión.`
        }
        confirmLabel={statusTarget?.status === 'ACTIVO' ? 'Desactivar' : 'Activar'}
        destructive={statusTarget?.status === 'ACTIVO'}
        onConfirm={async () => {
          if (statusTarget) await toggleStatus(statusTarget);
        }}
      />

      {resetTarget ? (
        <ResetPasswordDialog
          user={resetTarget}
          open
          onOpenChange={(open) => {
            if (!open) setResetTarget(null);
          }}
          onReset={onReset}
        />
      ) : null}
    </div>
  );
}
