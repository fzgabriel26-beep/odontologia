'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

/**
 * Tablero de la agenda diaria (SDD §11 / fase 8): navegación por fecha,
 * filtro por profesional, alta de turnos y acciones sobre los existentes.
 */
export function AgendaBoard() {
  const [date, setDate] = useState(todayIso());
  const [professionalId, setProfessionalId] = useState('');
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await listAppointments({
        from: date,
        to: date,
        professionalId: professionalId === '' ? undefined : professionalId,
      });
      setAppointments(list);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'No se pudieron cargar los turnos.');
    }
  }, [date, professionalId]);

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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Agenda</CardTitle>
              <p className="text-sm text-muted-foreground">{formatDayLabel(date)}</p>
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

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Día anterior"
                onClick={() => setDate((current) => addDaysIso(current, -1))}
              >
                ◀
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDate(todayIso())}>
                Hoy
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Día siguiente"
                onClick={() => setDate((current) => addDaysIso(current, 1))}
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

          <AppointmentListPanel
            appointments={appointments}
            onChanged={() => void load()}
            emptyMessage={
              professionalId === ''
                ? `No hay turnos el ${formatDayLabel(date)}.`
                : `No hay turnos para ese profesional el ${formatDayLabel(date)}.`
            }
          />

          {showForm ? (
            <AppointmentFormDialog
              appointment={null}
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
