'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { loginSchema, type LoginInput } from '@odonto/validation';
import { ApiError, apiFetch, fetchMe } from '@/lib/api';
import { AuthShell } from '@/components/auth-shell';
import { FieldError } from '@/components/form/field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Inicio de sesión (SDD, fase 2). */
export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // Si ya hay sesión vigente, no mostrar el login.
  useEffect(() => {
    void fetchMe().then((user) => {
      if (user) router.replace('/dashboard');
    });
  }, [router]);

  const onSubmit = async (values: LoginInput): Promise<void> => {
    setServerError(null);
    try {
      await apiFetch('/auth/login', { method: 'POST', body: values });
      router.replace('/dashboard');
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : 'No fue posible procesar la solicitud.',
      );
    }
  };

  return (
    <AuthShell
      title="Iniciar sesión"
      description="Acceso restringido al personal autorizado."
      footer={
        <span>
          ¿No tenés cuenta?{' '}
          <Link
            href="/registro"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Registrate con tu código de invitación
          </Link>
        </span>
      }
    >
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

        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
          <FieldError message={errors.password?.message} />
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Ingresando…' : 'Ingresar'}
        </Button>

        <p className="text-center text-sm">
          <Link
            href="/recuperar"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
