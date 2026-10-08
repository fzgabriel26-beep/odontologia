'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { PASSWORD_POLICY_MESSAGE } from '@odonto/validation';
import { ApiError, apiFetch, fetchMe } from '@/lib/api';
import { registerFormSchema, type RegisterFormValues } from '@/lib/schemas';
import { AuthShell } from '@/components/auth-shell';
import { FieldError } from '@/components/form/field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Registro con código de invitación (SDD, fase 2): no existe registro público. */
export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      dni: '',
      email: '',
      password: '',
      confirm: '',
      invitationCode: '',
    },
  });

  useEffect(() => {
    void fetchMe().then((user) => {
      if (user) router.replace('/dashboard');
    });
  }, [router]);

  const onSubmit = async (values: RegisterFormValues): Promise<void> => {
    setServerError(null);
    const payload = {
      firstName: values.firstName,
      lastName: values.lastName,
      dni: values.dni,
      email: values.email,
      password: values.password,
      invitationCode: values.invitationCode,
    };
    try {
      await apiFetch('/auth/register', { method: 'POST', body: payload });
      router.replace('/dashboard');
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : 'No fue posible procesar la solicitud.',
      );
    }
  };

  return (
    <AuthShell
      title="Crear cuenta"
      description="Necesitás un código de invitación generado por un administrador."
      footer={
        <span>
          ¿Ya tenés cuenta?{' '}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Iniciar sesión
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">Nombre</Label>
            <Input id="firstName" autoComplete="given-name" {...register('firstName')} />
            <FieldError message={errors.firstName?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Apellido</Label>
            <Input id="lastName" autoComplete="family-name" {...register('lastName')} />
            <FieldError message={errors.lastName?.message} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dni">DNI</Label>
          <Input id="dni" inputMode="numeric" placeholder="30123456" {...register('dni')} />
          <FieldError message={errors.dni?.message} />
        </div>

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
            autoComplete="new-password"
            {...register('password')}
          />
          <FieldError message={errors.password?.message} />
          <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_MESSAGE}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar contraseña</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            {...register('confirm')}
          />
          <FieldError message={errors.confirm?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="invitationCode">Código de invitación</Label>
          <Input
            id="invitationCode"
            placeholder="ODONTO-XXXX-XXXX"
            autoComplete="off"
            {...register('invitationCode')}
          />
          <FieldError message={errors.invitationCode?.message} />
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </form>
    </AuthShell>
  );
}
