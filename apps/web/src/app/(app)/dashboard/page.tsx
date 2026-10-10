'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAppSession } from '@/components/app-session';
import { ROLE_LABELS, type Role } from '@odonto/types';
import { ApiError } from '@/lib/api';
import {
  addDaysIso,
  appointmentStatusLabel,
  appointmentStatusTone,
  fetchAppointmentStats,
  isClosedAppointment,
  listAppointments,
  todayIso,
  userName,
  type Appointment,
  type AppointmentStats,
} from '@/lib/appointments';
import { formatDateOnly } from '@/lib/patients';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Fila compacta de turno para los listados del dashboard. */
function DashboardRow({ appointment }: { appointment: Appointment }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="truncate text-sm">
        {formatDateOnly(appointment.date)} {appointment.time} · {userName(appointment.patient)}
      </span>
      <Badge tone={appointmentStatusTone(appointment.status)}>
        {appointmentStatusLabel(appointment.status)}
      </Badge>
    </li>
  );
}

/**
 * Panel inicial autenticado (SDD CU-11 / fase 8): indicadores de la agenda
 * (hoy, próximos, pendientes, confirmados, atendidos, cancelaciones y
 * ausencias), turnos del día, próximos turnos y accesos rápidos.
 */
export default function DashboardPage() {
  const { user } = useAppSession();
  const [stats, setStats] = useState<AppointmentStats | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[] | null>(null);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const today = todayIso();
        const [statsData, todayList, weekList] = await Promise.all([
          fetchAppointmentStats(today),
          listAppointments({ from: today, to: today }),
          listAppointments({ from: today, to: addDaysIso(today, 7) }),
        ]);
        setStats(statsData);
        setTodayAppointments(todayList);
        setUpcoming(weekList.filter((a) => !isClosedAppointment(a.status)).slice(0, 6));
        setLoadError(null);
      } catch (error) {
        setLoadError(
          error instanceof ApiError
            ? error.message
            : 'No se pudieron cargar los indicadores de la agenda.',
        );
      }
    })();
  }, []);

  if (!user) return null;

  const roleLabel = ROLE_LABELS[user.role.key as Role] ?? user.role.name;
  const isAdmin = user.permissions.includes('users.manage');

  const indicators: Array<{ label: string; value: number }> = [
    { label: 'Turnos hoy', value: stats?.today ?? 0 },
    { label: 'Próximos (7 días)', value: stats?.upcoming ?? 0 },
    { label: 'Pendientes', value: stats?.byStatus.PENDIENTE ?? 0 },
    { label: 'Confirmados', value: stats?.byStatus.CONFIRMADO ?? 0 },
    { label: 'Atendidos', value: stats?.byStatus.ATENDIDO ?? 0 },
    { label: 'Cancelaciones', value: stats?.byStatus.CANCELADO ?? 0 },
    { label: 'Ausencias', value: stats?.byStatus.AUSENTE ?? 0 },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Hola, {user.firstName} {user.lastName} · {roleLabel}
        </p>
      </header>

      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {indicators.map((indicator) => (
          <Card key={indicator.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{indicator.label}</p>
              <p className="text-2xl font-semibold tabular-nums">
                {stats === null ? '…' : indicator.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Turnos de hoy</CardTitle>
            <CardDescription>Agenda del día, ordenada por hora.</CardDescription>
          </CardHeader>
          <CardContent>
            {todayAppointments === null ? (
              <p className="text-sm text-muted-foreground">Cargando turnos…</p>
            ) : todayAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay turnos hoy.</p>
            ) : (
              <ul className="space-y-2">
                {todayAppointments.map((appointment) => (
                  <DashboardRow key={appointment.id} appointment={appointment} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximos turnos</CardTitle>
            <CardDescription>Los próximos 7 días (abiertos).</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay turnos en los próximos días.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((appointment) => (
                  <DashboardRow key={appointment.id} appointment={appointment} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accesos rápidos</CardTitle>
          <CardDescription>Ingresaste con {user.email}.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/agenda" className="font-medium underline-offset-4 hover:underline">
              Ir a la agenda
            </Link>
            <Link href="/pacientes" className="font-medium underline-offset-4 hover:underline">
              Buscar pacientes
            </Link>
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
