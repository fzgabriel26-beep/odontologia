'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  PASSWORD_POLICY_MESSAGE,
  createUserSchema,
  type CreateUserInput,
} from '@odonto/validation';
import { ROLE_LABELS, ROLES, type Role } from '@odonto/types';
import { ApiError, apiFetch } from '@/lib/api';
import type { AdminUser } from '@/lib/admin';
import {
  adminResetFormSchema,
  editUserFormSchema,
  type AdminResetFormValues,
  type EditUserFormValues,
} from '@/lib/schemas';
import { FieldError } from '@/components/form/field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

function toServerMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'No fue posible procesar la solicitud.';
}

/** Rellena los errores por campo si el backend los devolvió (raro: la validación Zod corre también acá). */
function applyFieldErrors<T extends Record<string, unknown>>(
  error: unknown,
  setError: (key: keyof T, error: { message: string }) => void,
): boolean {
  if (!(error instanceof ApiError) || !error.fields) return false;
  for (const [key, message] of Object.entries(error.fields)) {
    setError(key as keyof T, { message });
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Alta de usuario                                                     */
/* ------------------------------------------------------------------ */

export function CreateUserForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      dni: '',
      email: '',
      password: '',
      roleKey: 'ODONTOLOGO',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await apiFetch<AdminUser>('/users', { method: 'POST', body: values });
      onCreated();
    } catch (error) {
      if (!applyFieldErrors<CreateUserInput>(error, setError)) {
        setServerError(toServerMessage(error));
      }
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo usuario</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {serverError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="create-firstName">Nombre</Label>
              <Input id="create-firstName" autoComplete="off" {...register('firstName')} />
              <FieldError message={errors.firstName?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-lastName">Apellido</Label>
              <Input id="create-lastName" autoComplete="off" {...register('lastName')} />
              <FieldError message={errors.lastName?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-dni">DNI</Label>
              <Input id="create-dni" inputMode="numeric" autoComplete="off" {...register('dni')} />
              <FieldError message={errors.dni?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">Email</Label>
              <Input id="create-email" type="email" autoComplete="off" {...register('email')} />
              <FieldError message={errors.email?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Contraseña</Label>
              <Input
                id="create-password"
                type="password"
                autoComplete="new-password"
                {...register('password')}
              />
              <FieldError message={errors.password?.message} />
              <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_MESSAGE}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-roleKey">Rol</Label>
              <NativeSelect id="create-roleKey" {...register('roleKey')}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </NativeSelect>
              <FieldError message={errors.roleKey?.message} />
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Crear usuario'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Edición de usuario                                                  */
/* ------------------------------------------------------------------ */

export function EditUserForm({
  user,
  canChangeRole,
  onCancel,
  onSaved,
}: {
  user: AdminUser;
  canChangeRole: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      dni: user.dni,
      email: user.email,
      roleKey: user.role.key as Role,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await apiFetch<AdminUser>(`/users/${user.id}`, {
        method: 'PATCH',
        body: {
          firstName: values.firstName,
          lastName: values.lastName,
          dni: values.dni,
          email: values.email,
        },
      });
      // El rol tiene endpoint propio (POST /users/:id/role) y no se toca si no cambió.
      if (canChangeRole && values.roleKey !== user.role.key) {
        await apiFetch<AdminUser>(`/users/${user.id}/role`, {
          method: 'POST',
          body: { roleKey: values.roleKey },
        });
      }
      onSaved();
    } catch (error) {
      if (!applyFieldErrors<EditUserFormValues>(error, setError)) {
        setServerError(toServerMessage(error));
      }
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Editar: {user.firstName} {user.lastName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {serverError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-firstName">Nombre</Label>
              <Input id="edit-firstName" autoComplete="off" {...register('firstName')} />
              <FieldError message={errors.firstName?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lastName">Apellido</Label>
              <Input id="edit-lastName" autoComplete="off" {...register('lastName')} />
              <FieldError message={errors.lastName?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-dni">DNI</Label>
              <Input id="edit-dni" inputMode="numeric" autoComplete="off" {...register('dni')} />
              <FieldError message={errors.dni?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" autoComplete="off" {...register('email')} />
              <FieldError message={errors.email?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-roleKey">Rol</Label>
              <NativeSelect id="edit-roleKey" disabled={!canChangeRole} {...register('roleKey')}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </NativeSelect>
              <FieldError message={errors.roleKey?.message} />
              {!canChangeRole ? (
                <p className="text-xs text-muted-foreground">No podés cambiar tu propio rol.</p>
              ) : null}
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Reset de contraseña por administrador                               */
/* ------------------------------------------------------------------ */

export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
  onReset,
}: {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReset: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AdminResetFormValues>({
    resolver: zodResolver(adminResetFormSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const close = (next: boolean): void => {
    if (isSubmitting) return;
    setServerError(null);
    reset({ password: '', confirm: '' });
    onOpenChange(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await apiFetch(`/users/${user.id}/password`, {
        method: 'POST',
        body: { password: values.password },
      });
      reset({ password: '', confirm: '' });
      onReset();
      onOpenChange(false);
    } catch (error) {
      if (!applyFieldErrors<AdminResetFormValues>(error, setError)) {
        setServerError(toServerMessage(error));
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restablecer contraseña</DialogTitle>
          <DialogDescription>
            Nueva contraseña para {user.firstName} {user.lastName} ({user.email}). Se cerrarán todas
            sus sesiones activas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {serverError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="reset-password">Nueva contraseña</Label>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              {...register('password')}
            />
            <FieldError message={errors.password?.message} />
            <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_MESSAGE}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-confirm">Repetir contraseña</Label>
            <Input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              {...register('confirm')}
            />
            <FieldError message={errors.confirm?.message} />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Restableciendo…' : 'Restablecer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
