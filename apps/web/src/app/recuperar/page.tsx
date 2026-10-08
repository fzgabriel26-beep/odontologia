'use client';

import Link from 'next/link';
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@odonto/validation';
import { ApiError, apiFetch } from '@/lib/api';
import { AuthShell } from '@/components/auth-shell';
import { FieldError } from '@/components/form/field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Solicitud de recuperación de contraseña (SDD, fase 2).
 * La respuesta es siempre la misma exista o no el email (sin enumeración).
 */
export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordInput): Promise<void> => {
    setServerError(null);
    try {
      await apiFetch('/auth/password/forgot', { method: 'POST', body: values });
      setSent(true);
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : 'No fue posible procesar la solicitud.',
      );
    }
  };

  return (
    <AuthShell
      title="Recuperar contraseña"
      description="Te enviaremos las instrucciones a tu email."
      footer={
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Volver a iniciar sesión
        </Link>
      }
    >
      {sent ? (
        <Alert variant="success">
          <AlertDescription>
            Si existe una cuenta con ese email, vas a recibir las instrucciones para restablecer tu
            contraseña.
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="nombre@consultorio.com"
              {...register('email')}
            />
            <FieldError message={errors.email?.message} />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Enviando…' : 'Enviar instrucciones'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
