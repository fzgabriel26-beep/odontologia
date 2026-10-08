'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { PASSWORD_POLICY_MESSAGE } from '@odonto/validation';
import { ApiError, apiFetch } from '@/lib/api';
import { resetFormSchema, type ResetFormValues } from '@/lib/schemas';
import { AuthShell } from '@/components/auth-shell';
import { FieldError } from '@/components/form/field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Nueva contraseña a partir del token del enlace (SDD, fase 2). */
function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { token, password: '', confirm: '' },
  });

  const onSubmit = async (values: ResetFormValues): Promise<void> => {
    setServerError(null);
    try {
      await apiFetch('/auth/password/reset', {
        method: 'POST',
        body: { token: values.token, password: values.password },
      });
      setDone(true);
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : 'No fue posible procesar la solicitud.',
      );
    }
  };

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          El enlace de restablecimiento no es válido. Solicitá uno nuevo desde{' '}
          <Link href="/recuperar" className="underline">
            recuperar contraseña
          </Link>
          .
        </AlertDescription>
      </Alert>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert variant="success">
          <AlertDescription>
            Tu contraseña se actualizó correctamente. Todas las sesiones anteriores fueron cerradas.
          </AlertDescription>
        </Alert>
        <Button className="w-full" onClick={() => router.replace('/login')}>
          Ir a iniciar sesión
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError ? (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="password">Nueva contraseña</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
        />
        <FieldError message={errors.password?.message} />
        <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_MESSAGE}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmar contraseña</Label>
        <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} />
        <FieldError message={errors.confirm?.message} />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : 'Restablecer contraseña'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Restablecer contraseña"
      description="Elegí una contraseña nueva para tu cuenta."
      footer={
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Volver a iniciar sesión
        </Link>
      }
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando enlace…</p>}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
