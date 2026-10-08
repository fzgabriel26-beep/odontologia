'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  PAYMENT_METHODS,
  type PaymentMethod,
} from '@odonto/types';
import {
  changeAppointmentStatusSchema,
  registerSignaSchema,
  type ChangeAppointmentStatusInput,
  type RegisterSignaInput,
} from '@odonto/validation';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/admin';
import {
  appointmentStatusLabel,
  changeAppointmentStatus,
  fetchAppointment,
  formatAmount,
  nextAppointmentStatuses,
  paymentMethodLabel,
  registerAppointmentSigna,
  statusNeedsReason,
  todayIso,
  userName,
  type Appointment,
  type AppointmentDetail,
} from '@/lib/appointments';
import { FieldError } from '@/components/form/field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

function toServerMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'No fue posible procesar la solicitud.';
}

/* ------------------------------------------------------------------ */
/* Cambio de estado (CU-13)                                            */
/* ------------------------------------------------------------------ */

/**
 * Transición de estado del turno. Solo ofrece las salidas válidas desde el
 * estado actual (la autoridad es el backend) y exige motivo en
 * cancelación/ausencia/reprogramación (SDD §5.4).
 */
export function StatusChangeDialog({
  appointment,
  onCancel,
  onSaved,
}: {
  appointment: Appointment;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const options = nextAppointmentStatuses(appointment.status);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChangeAppointmentStatusInput>({
    resolver: zodResolver(changeAppointmentStatusSchema),
    defaultValues: { status: options[0] ?? 'CONFIRMADO', reason: '' },
  });

  const status = watch('status');
  const reasonRequired = statusNeedsReason(status);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await changeAppointmentStatus(appointment.id, values);
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        for (const [key, message] of Object.entries(error.fields)) {
          setError((key === 'form' ? 'root' : key) as 'root' | 'status' | 'reason', {
            message,
          });
        }
        return;
      }
      setServerError(toServerMessage(error));
    }
  });

  const formError =
    errors.root?.message ??
    (errors as unknown as Record<string, { message?: string } | undefined>).form?.message;

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar estado</DialogTitle>
          <DialogDescription>
            {userName(appointment.patient)} · {appointmentStatusLabel(appointment.status)} → nuevo
            estado. Cada cambio queda en el historial del turno.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {serverError || formError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError ?? formError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="status-next">Nuevo estado</Label>
            <NativeSelect
              id="status-next"
              invalid={Boolean(errors.status)}
              {...register('status')}
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {appointmentStatusLabel(option)}
                </option>
              ))}
            </NativeSelect>
            <FieldError message={errors.status?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status-reason">
              Motivo{reasonRequired ? '' : ' (opcional)'}
            </Label>
            <Textarea
              id="status-reason"
              placeholder={
                reasonRequired
                  ? 'Ej.: El paciente avisó, no se presentó, hay que buscar otro día…'
                  : 'Observación del cambio (opcional).'
              }
              className={errors.reason ? 'border-destructive' : undefined}
              {...register('reason')}
            />
            <FieldError message={errors.reason?.message} />
            {reasonRequired ? (
              <p className="text-xs text-muted-foreground">
                Obligatorio para cancelar, marcar ausente o reprogramar.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Aplicando…' : 'Cambiar estado'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Volver
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Seña (CU-14)                                                        */
/* ------------------------------------------------------------------ */

/** Registra o anula la seña del turno; no modifica su estado. */
export function SignaDialog({
  appointment,
  onCancel,
  onSaved,
}: {
  appointment: Appointment;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterSignaInput>({
    resolver: zodResolver(registerSignaSchema),
    defaultValues: {
      signaPaid: true,
      signaReceived: appointment.signaReceived ?? appointment.signaAmount,
      signaDate: appointment.signaDate ?? todayIso(),
      signaMethod: appointment.signaMethod ?? 'EFECTIVO',
      signaNotes: appointment.signaNotes ?? '',
    },
  });

  const signaPaid = watch('signaPaid');

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await registerAppointmentSigna(appointment.id, values);
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        for (const [key, message] of Object.entries(error.fields)) {
          setError(
            (key === 'form' ? 'root' : key) as 'root' | keyof RegisterSignaInput,
            { message },
          );
        }
        return;
      }
      setServerError(toServerMessage(error));
    }
  });

  const formError =
    errors.root?.message ??
    (errors as unknown as Record<string, { message?: string } | undefined>).form?.message;
  const requiredAmount = formatAmount(appointment.signaAmount);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar seña</DialogTitle>
          <DialogDescription>
            {userName(appointment.patient)}
            {requiredAmount !== null ? ` · Seña requerida: ${requiredAmount}` : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {serverError || formError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError ?? formError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex items-center gap-2">
            <Input
              id="signa-paid"
              type="checkbox"
              className="h-4 w-4"
              {...register('signaPaid')}
            />
            <Label htmlFor="signa-paid" className="mb-0">
              Seña abonada
            </Label>
          </div>

          {signaPaid ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="signa-received">Monto recibido</Label>
                <Input
                  id="signa-received"
                  type="number"
                  min={0}
                  step="0.01"
                  className={errors.signaReceived ? 'border-destructive' : undefined}
                  {...register('signaReceived', {
                    setValueAs: (value) =>
                      value === '' || value === null || value === undefined
                        ? null
                        : Number(value),
                  })}
                />
                <FieldError message={errors.signaReceived?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signa-date">Fecha</Label>
                <Input
                  id="signa-date"
                  type="date"
                  className={errors.signaDate ? 'border-destructive' : undefined}
                  {...register('signaDate')}
                />
                <FieldError message={errors.signaDate?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signa-method">Método de pago</Label>
                <NativeSelect
                  id="signa-method"
                  invalid={Boolean(errors.signaMethod)}
                  {...register('signaMethod')}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {paymentMethodLabel(method as PaymentMethod)}
                    </option>
                  ))}
                </NativeSelect>
                <FieldError message={errors.signaMethod?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signa-notes">Notas</Label>
                <Input
                  id="signa-notes"
                  className={errors.signaNotes ? 'border-destructive' : undefined}
                  {...register('signaNotes')}
                />
                <FieldError message={errors.signaNotes?.message} />
              </div>
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                Al desmarcar “Seña abonada” se borran los datos de pago registrados (queda asentado
                en la auditoría). El monto requerido del turno no se modifica.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Guardar seña'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Volver
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Historial de estados                                                */
/* ------------------------------------------------------------------ */

/** Historial completo del turno: transiciones, motivos y autores (nunca se borra). */
export function HistoryDialog({
  appointment,
  onCancel,
}: {
  appointment: Appointment;
  onCancel: () => void;
}) {
  const [detail, setDetail] = useState<AppointmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setDetail(await fetchAppointment(appointment.id));
      } catch (err) {
        setError(toServerMessage(err));
      }
    })();
  }, [appointment.id]);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Historial del turno</DialogTitle>
          <DialogDescription>
            {userName(appointment.patient)} · {appointment.date} {appointment.time}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {detail === null && error === null ? (
          <p className="text-sm text-muted-foreground">Cargando historial…</p>
        ) : null}

        {detail !== null && detail.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hubo cambios de estado: el turno sigue en{' '}
            {appointmentStatusLabel(detail.status)}.
          </p>
        ) : null}

        {detail !== null && detail.events.length > 0 ? (
          <ol className="space-y-3">
            {detail.events.map((event) => (
              <li key={event.id} className="rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="info">{appointmentStatusLabel(event.toStatus)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {event.fromStatus !== null
                      ? `desde ${appointmentStatusLabel(event.fromStatus)} · `
                      : ''}
                    {formatDateTime(event.createdAt)} · {userName(event.createdBy)}
                  </span>
                </div>
                {event.reason !== null ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    Motivo: {event.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
