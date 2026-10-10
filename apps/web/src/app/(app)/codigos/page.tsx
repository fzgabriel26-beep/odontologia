'use client';

import { useCallback, useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  INVITATION_STATUS_LABELS,
  ROLE_LABELS,
  ROLES,
  type InvitationStatus,
  type Role,
} from '@odonto/types';
import { ApiError, apiFetch } from '@/lib/api';
import { formatDate, formatDateTime, type InvitationCodeRow } from '@/lib/admin';
import { invitationCodeFormSchema, type InvitationCodeFormValues } from '@/lib/schemas';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FieldError } from '@/components/form/field-error';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

const STATUS_TONES: Record<InvitationStatus, BadgeTone> = {
  DISPONIBLE: 'success',
  UTILIZADO: 'info',
  EXPIRADO: 'warning',
  REVOGADO: 'destructive',
};

/**
 * Códigos de invitación (SDD, fase 3 / CU-04): generar, consultar y revocar.
 * Sin registro público: toda cuenta nueva nace de un código de este panel.
 */
export default function InvitationCodesPage() {
  const [codes, setCodes] = useState<InvitationCodeRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<InvitationCodeRow | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<InvitationCodeRow | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvitationCodeFormValues>({
    resolver: zodResolver(invitationCodeFormSchema),
    defaultValues: { roleKey: 'ODONTOLOGO', expiresInDays: '' },
  });

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<InvitationCodeRow[]>('/invitation-codes');
      setCodes(list);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'No se pudo cargar el listado.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const created = await apiFetch<InvitationCodeRow>('/invitation-codes', {
        method: 'POST',
        body: {
          roleKey: values.roleKey,
          expiresInDays: values.expiresInDays === '' ? null : Number(values.expiresInDays),
        },
      });
      setLastCreated(created);
      setCopied(false);
      reset({ roleKey: values.roleKey, expiresInDays: '' });
      await load();
    } catch (error) {
      setLastCreated(null);
      setFormError(error instanceof ApiError ? error.message : 'No se pudo generar el código.');
    }
  });

  const revoke = async (): Promise<void> => {
    if (!revokeTarget) return;
    await apiFetch<InvitationCodeRow>(`/invitation-codes/${revokeTarget.id}/revoke`, {
      method: 'POST',
    });
    setNotice(`Código ${revokeTarget.code} revocado.`);
    await load();
  };

  const copyCode = async (): Promise<void> => {
    if (!lastCreated) return;
    try {
      await navigator.clipboard.writeText(lastCreated.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Códigos de invitación</h1>
        <p className="text-sm text-muted-foreground">
          Generá códigos para registrar cuentas nuevas (CU-04). Cada código tiene un rol y puede
          revocarse.
        </p>
      </header>

      {notice ? (
        <Alert variant="success">
          <AlertTitle>Listo</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {lastCreated ? (
        <Alert variant="success">
          <AlertTitle>Código generado</AlertTitle>
          <AlertDescription>
            <span className="flex flex-wrap items-center gap-3">
              <code className="rounded border bg-background px-2 py-1 font-mono text-sm font-semibold tracking-wide">
                {lastCreated.code}
              </code>
              <span>
                Rol: {ROLE_LABELS[lastCreated.role.key as Role] ?? lastCreated.role.name} · Expira:{' '}
                {lastCreated.expiresAt ? formatDate(lastCreated.expiresAt) : 'sin expiración'}
              </span>
              <Button variant="outline" size="sm" onClick={() => void copyCode()}>
                {copied ? 'Copiado ✓' : 'Copiar'}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Generar código</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="code-roleKey">Rol al registrarse</Label>
                <NativeSelect id="code-roleKey" {...register('roleKey')}>
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </NativeSelect>
                <FieldError message={errors.roleKey?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code-expiresInDays">Expiración</Label>
                <NativeSelect id="code-expiresInDays" {...register('expiresInDays')}>
                  <option value="">Sin expiración</option>
                  <option value="1">1 día</option>
                  <option value="7">7 días</option>
                  <option value="30">30 días</option>
                  <option value="90">90 días</option>
                </NativeSelect>
                <FieldError message={errors.expiresInDays?.message} />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                  {isSubmitting ? 'Generando…' : 'Generar código'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Códigos generados</h2>

        {codes === null && !loadError ? (
          <p className="text-sm text-muted-foreground">Cargando códigos…</p>
        ) : null}

        {codes !== null && codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no generaste códigos.</p>
        ) : null}

        {codes !== null && codes.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Código</th>
                  <th className="px-4 py-3 font-medium">Rol</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Expira</th>
                  <th className="px-4 py-3 font-medium">Usado por</th>
                  <th className="px-4 py-3 font-medium">Generado por</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <code className="font-mono text-xs font-semibold">{row.code}</code>
                    </td>
                    <td className="px-4 py-3">
                      {ROLE_LABELS[row.role.key as Role] ?? row.role.name}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONES[row.displayStatus]}>
                        {INVITATION_STATUS_LABELS[row.displayStatus]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.expiresAt ? formatDate(row.expiresAt) : 'Sin expiración'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.usedBy
                        ? `${row.usedBy.firstName} ${row.usedBy.lastName} · ${formatDateTime(row.usedAt)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.createdBy
                        ? `${row.createdBy.firstName} ${row.createdBy.lastName} · ${formatDate(row.createdAt)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {row.status === 'DISPONIBLE' ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setNotice(null);
                              setRevokeTarget(row);
                            }}
                          >
                            Revocar
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title="Revocar código"
        description={`El código ${revokeTarget?.code ?? ''} dejará de poder usarse para registrarse.`}
        confirmLabel="Revocar"
        destructive
        onConfirm={revoke}
      />
    </div>
  );
}
