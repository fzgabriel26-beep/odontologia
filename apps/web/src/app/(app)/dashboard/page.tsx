'use client';

import Link from 'next/link';
import { useAppSession } from '@/components/app-session';
import { ROLE_LABELS, type Role } from '@odonto/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Panel inicial autenticado (SDD CU-11). Muestra el resumen de la sesión y
 * accesos rápidos a los módulos; los indicadores clínicos llegan con las
 * fases de pacientes/agenda.
 */
export default function DashboardPage() {
  const { user } = useAppSession();
  if (!user) return null;

  const roleLabel = ROLE_LABELS[user.role.key as Role] ?? user.role.name;
  const isAdmin = user.permissions.includes('users.manage');

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Hola, {user.firstName} {user.lastName} · {roleLabel}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Sesión activa</CardTitle>
          <CardDescription>Ingresaste con {user.email}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Los módulos de pacientes, historia clínica, odontograma y agenda se habilitan en las
            próximas fases.
          </p>
          <div className="flex flex-wrap gap-3">
            {isAdmin ? (
              <>
                <Link href="/usuarios" className="font-medium underline-offset-4 hover:underline">
                  Gestionar usuarios
                </Link>
                <Link href="/codigos" className="font-medium underline-offset-4 hover:underline">
                  Códigos de invitación
                </Link>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
