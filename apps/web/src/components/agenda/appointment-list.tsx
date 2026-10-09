'use client';

import { useState } from 'react';
import {
  appointmentStatusLabel,
  appointmentStatusTone,
  formatAmount,
  isClosedAppointment,
  userName,
  type Appointment,
} from '@/lib/appointments';
import { AppointmentFormDialog } from '@/components/agenda/appointment-form';
import {
  HistoryDialog,
  SignaDialog,
  StatusChangeDialog,
} from '@/components/agenda/appointment-dialogs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Fila de la agenda: horario, paciente, profesional, estado y seña, con las
 * acciones habilitadas según el estado (los turnos cerrados solo muestran
 * historial; nunca se eliminan, SDD §5.4).
 */
export function AppointmentEntry({
  appointment,
  onStatus,
  onSigna,
  onEdit,
  onHistory,
}: {
  appointment: Appointment;
  onStatus?: (appointment: Appointment) => void;
  onSigna?: (appointment: Appointment) => void;
  onEdit?: (appointment: Appointment) => void;
  onHistory?: (appointment: Appointment) => void;
}) {
  const closed = isClosedAppointment(appointment.status);
  const signaAmount = formatAmount(
    appointment.signaPaid ? appointment.signaReceived : appointment.signaAmount,
  );

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">{appointment.time}</span>
          <span className="text-xs text-muted-foreground">({appointment.durationMin} min)</span>
          <Badge tone={appointmentStatusTone(appointment.status)}>
            {appointmentStatusLabel(appointment.status)}
          </Badge>
          {appointment.signaRequired && signaAmount !== null ? (
            <Badge tone={appointment.signaPaid ? 'success' : 'warning'}>
              {appointment.signaPaid ? 'Seña abonada' : 'Seña pendiente'} {signaAmount}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {!closed && onStatus ? (
            <Button size="sm" variant="outline" onClick={() => onStatus(appointment)}>
              Estado
            </Button>
          ) : null}
          {!closed && onSigna ? (
            <Button size="sm" variant="outline" onClick={() => onSigna(appointment)}>
              Seña
            </Button>
          ) : null}
          {!closed && onEdit ? (
            <Button size="sm" variant="outline" onClick={() => onEdit(appointment)}>
              Editar
            </Button>
          ) : null}
          {onHistory ? (
            <Button size="sm" variant="ghost" onClick={() => onHistory(appointment)}>
              Historial
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">
          {userName(appointment.patient)}{' '}
          <span className="font-normal text-muted-foreground">· DNI {appointment.patient.dni}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Profesional: {userName(appointment.professional)} · Creado por{' '}
          {userName(appointment.createdBy)}
        </p>
        {appointment.reason !== null && appointment.reason !== '' ? (
          <p className="text-sm">Motivo: {appointment.reason}</p>
        ) : null}
        {appointment.cancelReason !== null ? (
          <p className="text-xs text-muted-foreground">
            Cancelación: {appointment.cancelReason}
            {appointment.cancelledBy !== null ? ` (por ${userName(appointment.cancelledBy)})` : ''}
          </p>
        ) : null}
        {appointment.observations !== null && appointment.observations !== '' ? (
          <p className="text-sm text-muted-foreground">{appointment.observations}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Listado de turnos con todas las acciones de la agenda (estado, seña, edición
 * e historial). Lo comparten la página /agenda y la pestaña "Turnos" de la
 * ficha del paciente; el alta se ofrece fuera del panel (paciente fijo o no).
 */
export function AppointmentListPanel({
  appointments,
  onChanged,
  emptyMessage,
}: {
  /** null = cargando. */
  appointments: Appointment[] | null;
  onChanged: () => void;
  emptyMessage: string;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<Appointment | null>(null);
  const [signaTarget, setSignaTarget] = useState<Appointment | null>(null);
  const [editTarget, setEditTarget] = useState<Appointment | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Appointment | null>(null);

  const refresh = (message: string) => {
    setNotice(message);
    onChanged();
  };

  return (
    <div className="space-y-4">
      {notice ? (
        <Alert variant="success">
          <AlertTitle>Listo</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {appointments === null ? (
        <p className="text-sm text-muted-foreground">Cargando turnos…</p>
      ) : null}

      {appointments !== null && appointments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : null}

      {appointments !== null && appointments.length > 0 ? (
        <div className="space-y-3">
          {appointments.map((appointment) => (
            <AppointmentEntry
              key={appointment.id}
              appointment={appointment}
              onStatus={setStatusTarget}
              onSigna={setSignaTarget}
              onEdit={setEditTarget}
              onHistory={setHistoryTarget}
            />
          ))}
        </div>
      ) : null}

      {statusTarget !== null ? (
        <StatusChangeDialog
          appointment={statusTarget}
          onCancel={() => setStatusTarget(null)}
          onSaved={() => {
            setStatusTarget(null);
            refresh('Estado del turno actualizado. Quedó registrado en el historial.');
          }}
        />
      ) : null}

      {signaTarget !== null ? (
        <SignaDialog
          appointment={signaTarget}
          onCancel={() => setSignaTarget(null)}
          onSaved={() => {
            setSignaTarget(null);
            refresh('Seña registrada.');
          }}
        />
      ) : null}

      {editTarget !== null ? (
        <AppointmentFormDialog
          appointment={editTarget}
          onCancel={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            refresh('Turno actualizado.');
          }}
        />
      ) : null}

      {historyTarget !== null ? (
        <HistoryDialog appointment={historyTarget} onCancel={() => setHistoryTarget(null)} />
      ) : null}
    </div>
  );
}
