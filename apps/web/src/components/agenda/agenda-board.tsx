'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ROLE_LABELS, type Role } from '@odonto/types';
import { ApiError } from '@/lib/api';
import {
  addDaysIso,
  formatDayLabel,
  listAppointments,
  listProfessionals,
  todayIso,
  userName,
  type Appointment,
  type ProfessionalOption,
} from '@/lib/appointments';
import { AppointmentFormDialog } from '@/components/agenda/appointment-form';
import { AppointmentListPanel } from '@/components/agenda/appointment-list';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

type AgendaView = 'day' | 'week' | 'month';
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

function startOfWeekIso(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function addMonthsIso(iso: string, months: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function dayNumberIso(iso: string): number {
  return Number(iso.slice(8, 10));
}

function shortDateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function monthYearLabel(iso: string): string {
  const label = new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Tablero de la agenda (SDD §11 / fase 8): vista diaria, semanal y mensual,
 * con navegación, filtro por profesional, alta de turnos y acciones sobre los
 * existentes.
 */
export function AgendaBoard() {
  const [view, setView] = useState<AgendaView>('day');
  const [date, setDate] = useState(todayIso());
  const [professionalId, setProfessionalId] = useState('');
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const weekStart = useMemo(() => startOfWeekIso(date), [date]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDaysIso(weekStart, index)),
    [weekStart],
  );
  const monthDays = useMemo(() => {
    const anchor = new Date(`${date}T00:00:00.000Z`);
    const year = anchor.getUTCFullYear();
    const month = anchor.getUTCMonth();
    const first = new Date(Date.UTC(year, month, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    const start = new Date(first);
    start.setUTCDate(first.getUTCDate() - offset);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + index);
      return day.toISOString().slice(0, 10);
    });
  }, [date]);

  const range = useMemo(() => {
    if (view === 'day') return { from: date, to: date };
    if (view === 'week') {
      const start = startOfWeekIso(date);
      return { from: start, to: addDaysIso(start, 6) };
    }
    return { from: monthDays[0], to: monthDays[monthDays.length - 1] };
  }, [view, date, monthDays]);

  const grouped = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    const days = view === 'day' ? [date] : view === 'week' ? weekDays : monthDays;
    for (const day of days) map.set(day, []);
    if (appointments !== null) {
      for (const appointment of appointments) {
        const bucket = map.get(appointment.date);
        if (bucket !== undefined) bucket.push(appointment);
      }
      for (const bucket of map.values()) {
        bucket.sort((a, b) => a.time.localeCompare(b.time));
      }
    }
    return map;
  }, [view, date, weekDays, monthDays, appointments]);

  const load = useCallback(async () => {
    try {
      setAppointments(null);
      const list = await listAppointments({
        from: range.from,
        to: range.to,
        professionalId: professionalId === '' ? undefined : professionalId,
      });
      setAppointments(list);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'No se pudieron cargar los turnos.');
    }
  }, [range, professionalId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        setProfessionals(await listProfessionals());
      } catch {
        // El filtro queda sin opciones; el listado sigue funcionando.
        setProfessionals([]);
      }
    })();
  }, []);

  const navigate = useCallback((delta: number) => {
    if (view === 'day') setDate((current) => addDaysIso(current, delta));
    else if (view === 'week') setDate((current) => addDaysIso(current, delta * 7));
    else setDate((current) => addMonthsIso(current, delta));
  }, [view]);

  const goToday = useCallback(() => setDate(todayIso()), []);

  const headerLabel =
    view === 'day'
      ? formatDayLabel(date)
      : view === 'week'
        ? `${formatDayLabel(weekStart)} – ${formatDayLabel(addDaysIso(weekStart, 6))}`
        : monthYearLabel(date);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Agenda</CardTitle>
              <p className="text-sm text-muted-foreground">{headerLabel}</p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setNotice(null);
                setShowForm(true);
              }}
              disabled={showForm}
            >
              Nuevo turno
            </Button>
          </div>

          <div
            className="inline-flex w-full max-w-xs rounded-md border p-1"
            role="tablist"
            aria-label="Vista de la agenda"
          >
            {(
              [
                ['day', 'Día'],
                ['week', 'Semana'],
                ['month', 'Mes'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                role="tab"
                variant={view === value ? 'default' : 'outline'}
                className="flex-1"
                aria-selected={view === value}
                onClick={() => setView(value)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={
                  view === 'day'
                    ? 'Día anterior'
                    : view === 'week'
                      ? 'Semana anterior'
                      : 'Mes anterior'
                }
                onClick={() => navigate(-1)}
              >
                ◀
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={goToday}>
                Hoy
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={
                  view === 'day'
                    ? 'Día siguiente'
                    : view === 'week'
                      ? 'Semana siguiente'
                      : 'Mes siguiente'
                }
                onClick={() => navigate(1)}
              >
                ▶
              </Button>
            </div>

            <div className="w-40">
              <Input
                type="date"
                aria-label="Fecha de la agenda"
                value={date}
                onChange={(event) => {
                  if (event.target.value !== '') setDate(event.target.value);
                }}
              />
            </div>

            <div className="w-56">
              <Label htmlFor="agenda-professional" className="sr-only">
                Profesional
              </Label>
              <NativeSelect
                id="agenda-professional"
                value={professionalId}
                onChange={(event) => setProfessionalId(event.target.value)}
              >
                <option value="">Todos los profesionales</option>
                {professionals.map((professional) => (
                  <option key={professional.id} value={professional.id}>
                    {userName(professional)} (
                    {ROLE_LABELS[professional.roleKey as Role] ?? professional.roleKey})
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
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

          {view === 'day' ? (
            <AppointmentListPanel
              appointments={appointments}
              onChanged={() => void load()}
              emptyMessage={
                professionalId === ''
                  ? `No hay turnos el ${formatDayLabel(date)}.`
                  : `No hay turnos para ese profesional el ${formatDayLabel(date)}.`
              }
            />
          ) : null}

          {view === 'week' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {weekDays.map((day) => (
                <Card key={day}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{shortDateLabel(day)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AppointmentListPanel
                      appointments={grouped.get(day) ?? []}
                      onChanged={() => void load()}
                      emptyMessage="Sin turnos."
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}

          {view === 'month' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label}>{label}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((day) => {
                  const inMonth =
                    new Date(`${day}T00:00:00.000Z`).getUTCMonth() ===
                    new Date(`${date}T00:00:00.000Z`).getUTCMonth();
                  const today = day === todayIso();
                  const items = grouped.get(day) ?? [];
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        setDate(day);
                        setView('day');
                      }}
                      className={[
                        'min-h-24 rounded-md border p-2 text-left transition-colors hover:bg-secondary',
                        inMonth ? 'bg-background' : 'bg-muted/40 text-muted-foreground',
                        today ? 'ring-1 ring-primary' : '',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-medium">{dayNumberIso(day)}</span>
                        {items.length > 0 ? (
                          <Badge tone="info">{items.length}</Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 space-y-1">
                        {items.slice(0, 3).map((appointment) => (
                          <p key={appointment.id} className="truncate text-xs">
                            {appointment.time} · {userName(appointment.patient)}
                          </p>
                        ))}
                        {items.length > 3 ? (
                          <p className="text-xs text-muted-foreground">+{items.length - 3} más</p>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Turnos de {formatDayLabel(date)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <AppointmentListPanel
                    appointments={grouped.get(date) ?? []}
                    onChanged={() => void load()}
                    emptyMessage={
                      professionalId === ''
                        ? `No hay turnos el ${formatDayLabel(date)}.`
                        : `No hay turnos para ese profesional el ${formatDayLabel(date)}.`
                    }
                  />
                </CardContent>
              </Card>
            </div>
          ) : null}

          {showForm ? (
            <AppointmentFormDialog
              appointment={null}
              initialDate={date}
              onCancel={() => setShowForm(false)}
              onSaved={() => {
                setShowForm(false);
                setNotice('Turno creado con estado "Pendiente".');
                void load();
              }}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}