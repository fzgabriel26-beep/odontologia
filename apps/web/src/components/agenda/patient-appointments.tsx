'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  listPatientAppointments,
  type Appointment,
  type AppointmentPatientRef,
} from '@/lib/appointments';
import { AppointmentFormDialog } from '@/components/agenda/appointment-form';
import { AppointmentListPanel } from '@/components/agenda/appointment-list';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * Pestaña "Turnos" de la ficha (SDD §11 / fase 8): historial completo de
 * turnos del paciente (incluye cerrados) con las mismas acciones de la agenda
 * y alta con el paciente ya fijado.
 */
export function PatientAppointments({ patient }: { patient: AppointmentPatientRef }) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await listPatientAppointments(patient.id);
      setAppointments(list);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : 'No se pudieron cargar los turnos.',
      );
    }
  }, [patient.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Todos los turnos del paciente, del más reciente al más antiguo. Se cancelan o marcan
          ausentes; nunca se borran.
        </p>
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
        emptyMessage="Este paciente todavía no tiene turnos en la agenda."
      />

      {showForm ? (
        <AppointmentFormDialog
          appointment={null}
          patient={patient}
          onCancel={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            setNotice('Turno creado con estado "Pendiente".');
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
