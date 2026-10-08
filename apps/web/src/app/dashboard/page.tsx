'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { SessionUser } from '@odonto/types';
import { ROLE_LABELS, type Role } from '@odonto/types';
import { apiFetch, fetchMe } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function roleLabel(user: SessionUser): string {
  return ROLE_LABELS[user.role.key as Role] ?? user.role.name;
}

/**
 * Panel inicial autenticado (placeholder de la fase 2: la UI completa del
 * dashboard llega con las fases de pacientes/agenda). Su función aquí es
 * demostrar el flujo de sesión: protegido, muestra el usuario y permite salir.
 */
export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    void fetchMe().then((session) => {
      if (!session) {
        router.replace('/login');
        return;
      }
      setUser(session);
      setLoading(false);
    });
  }, [router]);

  const onLogout = async (): Promise<void> => {
    setLoggingOut(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      setLoggingOut(false);
      router.replace('/login');
    }
  };

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Sistema de Gestión Odontológica</h1>
          <Button variant="outline" onClick={() => void onLogout()} disabled={loggingOut}>
            {loggingOut ? 'Saliendo…' : 'Cerrar sesión'}
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>
              Hola, {user.firstName} {user.lastName}
            </CardTitle>
            <CardDescription>Sesión iniciada correctamente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Email:</span> {user.email}
            </p>
            <p>
              <span className="text-muted-foreground">Rol:</span> {roleLabel(user)}
            </p>
            <p>
              <span className="text-muted-foreground">Permisos:</span> {user.permissions.length}
            </p>
            <p className="text-muted-foreground">
              Los módulos (pacientes, historia clínica, agenda) se habilitan en las próximas fases.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
