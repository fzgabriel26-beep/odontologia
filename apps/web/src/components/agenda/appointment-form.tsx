'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ROLE_LABELS, type Role } from '@odonto/types';
import { createAppointmentSchema, type CreateAppointmentInput } from '@odonto/validation';
import { useForm } from 'react-hook-form';
import { ApiError, apiFetch } from '@/lib/api';
import {
  createAppointment,
  listProfessionals,
  todayIso,
  updateAppointment,
  userName,
  type Appointment,
  type AppointmentPatientRef,
  type ProfessionalOption,
} from '@/lib/appointments';
import { patientFullName, type Patient } from '@/lib/patients';
import { FieldError } from '@/components/form/field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

function applyFieldErrors(
  error: unknown,
  setError: (key: keyof CreateAppointmentInput | 'root', error: { message: string }) => void,
): boolean {
  if (!(error instanceof ApiError) || !error.fields) return false;
  for (const [key, message] of Object.entries(error.fields)) {
    const rootKey = key.split('.')[0];
    if (rootKey === 'form') {
      setError('root', { message });
    } else {
      setError(rootKey as keyof CreateAppointmentInput, { message });
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Buscador de pacientes (alta desde la agenda)                        */
/* ------------------------------------------------------------------ */

function PatientPicker({ onSelect }: { onSelect: (patient: Patient | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [picked, setPicked] = useState<Patient | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (picked !== null || query.trim() === '') {
      if (query.trim() === '') setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const list = await apiFetch<Patient[]>(
            `/patients?query=${encodeURIComponent(query.trim())}&status=ACTIVO`,
          );
          setResults(list.slice(0, 6));
          setSearchError(null);
        } catch {
          setSearchError('No se pudo buscar pacientes.');
        }
      })();
    }, 250);
    return () => clearTimeout(handle);
  }, [query, picked]);

  if (picked !== null) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-secondary px-3 py-2">
        <p className="text-sm">
          {patientFullName(picked)}{' '}
          <span className="text-muted-foreground">· DNI {picked.dni}</span>
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setPicked(null);
            setQuery('');
            setResults([]);
            onSelect(null);
          }}
        >
          Cambiar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        id="appointment-patient-search"
        placeholder="Buscar por nombre o DNI…"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {searchError ? <p className="text-xs text-destructive">{searchError}</p> : null}
      {results.length > 0 ? (
        <div className="divide-y rounded-md border">
          {results.map((patient) => (
            <button
              key={patient.id}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
              onClick={() => {
                setPicked(patient);
                setResults([]);
                onSelect(patient);
              }}
            >
              <span>
                {patientFullName(patient)}{' '}
                <span className="text-muted-foreground">· DNI {patient.dni}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {query.trim() !== '' && results.length === 0 && searchError === null ? (
        <p className="text-xs text-muted-foreground">Sin coincidencias para esa búsqueda.</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Diálogo de alta/edición de turno                                    */
/* ------------------------------------------------------------------ */

/**
 * Alta y edición de turnos (SDD CU-12). En edición el paciente queda fijo (no
 * se reasigna: se cancela y se crea otro); el estado y la seña se cambian con
 * sus propios endpoints.
 */
export function AppointmentFormDialog({
  appointment,
  patient,
  initialDate,
  onCancel,
  onSaved,
}: {
  /** Turno a editar (null = alta nueva). */
  appointment: Appointment | null;
  /** Paciente fijo (alta desde la ficha); si falta, se busca en el formulario. */
  patient?: AppointmentPatientRef | null;
  /** Fecha inicial sugerida al crear (por defecto hoy). */
  initialDate?: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const editing = appointment !== null;
  const fixedPatient = patient ?? null;
  const [serverError, setServerError] = useState<string | null>(null);
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
  const [pickedPatient, setPickedPatient] = useState<AppointmentPatientRef | null>(
    appointment?.patient ?? fixedPatient,
  );
  const [loadProfessionalsError, setLoadProfessionalsError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateAppointmentInput>({
    resolver: zodResolver(createAppointmentSchema),
    defaultValues: editing
      ? {
          patientId: appointment.patientId,
          professionalId: appointment.professionalId,
          date: appointment.date,
          time: appointment.time,
          durationMin: appointment.durationMin,
          reason: appointment.reason ?? '',
          observations: appointment.observations ?? '',
          signaRequired: appointment.signaRequired,
          signaAmount: appointment.signaAmount,
        }
      : {
          patientId: fixedPatient?.id ?? '',
          professionalId: '',
          date: initialDate ?? todayIso(),
          time: '09:00',
          durationMin: 30,
          reason: '',
          observations: '',
          signaRequired: false,
          signaAmount: null,
        },
  });

  useEffect(() => {
    void (async () => {
      try {
        setProfessionals(await listProfessionals());
      } catch {
        setLoadProfessionalsError('No se pudo cargar la lista de profesionales.');
      }
    })();
  }, []);

  const signaRequired = watch('signaRequired');

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (appointment !== null) {
        await updateAppointment(appointment.id, values);
      } else {
        await createAppointment(values);
      }
      onSaved();
    } catch (error) {
      if (!applyFieldErrors(error, setError)) {
        setServerError(toServerMessage(error));
      }
    }
  });

  const formError =
    errors.root?.message ??
    (errors as unknown as Record<string, { message?: string } | undefined>).form?.message;

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar turno' : 'Nuevo turno'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Modificá los datos operativos. El paciente no se reasigna; el estado se cambia con "Estado".'
              : 'Completá paciente, profesional, fecha y hora. El turno nace como "Pendiente".'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {serverError || formError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError ?? formError}</AlertDescription>
            </Alert>
          ) : null}

          {loadProfessionalsError ? (
            <Alert variant="destructive">
              <AlertDescription>{loadProfessionalsError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label>Paciente</Label>
            {pickedPatient !== null ? (
              <div className="rounded-md border bg-secondary px-3 py-2 text-sm">
                {userName(pickedPatient)}
                <span className="text-muted-foreground"> · DNI {pickedPatient.dni}</span>
              </div>
            ) : (
              <PatientPicker
                onSelect={(selected) => {
                  setPickedPatient(selected);
                  setValue('patientId', selected === null ? '' : selected.id);
                }}
              />
            )}
            <FieldError message={errors.patientId?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="appointment-professional">Profesional</Label>
              <NativeSelect
                id="appointment-professional"
                invalid={Boolean(errors.professionalId)}
                {...register('professionalId')}
              >
                <option value="">Elegí un profesional…</option>
                {professionals.map((professional) => (
                  <option key={professional.id} value={professional.id}>
                    {userName(professional)} (
                    {ROLE_LABELS[professional.roleKey as Role] ?? professional.roleKey})
                  </option>
                ))}
              </NativeSelect>
              <FieldError message={errors.professionalId?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-duration">Duración (minutos)</Label>
              <Input
                id="appointment-duration"
                type="number"
                min={5}
                max={480}
                step={5}
                className={errors.durationMin ? 'border-destructive' : undefined}
                {...register('durationMin', { valueAsNumber: true })}
              />
              <FieldError message={errors.durationMin?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-date">Fecha</Label>
              <Input
                id="appointment-date"
                type="date"
                className={errors.date ? 'border-destructive' : undefined}
                {...register('date')}
              />
              <FieldError message={errors.date?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-time">Hora</Label>
              <Input
                id="appointment-time"
                type="time"
                className={errors.time ? 'border-destructive' : undefined}
                {...register('time')}
              />
              <FieldError message={errors.time?.message} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="appointment-reason">Motivo</Label>
            <Input
              id="appointment-reason"
              placeholder="Ej.: Control, restauración…"
              className={errors.reason ? 'border-destructive' : undefined}
              {...register('reason')}
            />
            <FieldError message={errors.reason?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="appointment-observations">Observaciones</Label>
            <Textarea
              id="appointment-observations"
              className={errors.observations ? 'border-destructive' : undefined}
              {...register('observations')}
            />
            <FieldError message={errors.observations?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-2 pt-5">
              <Input
                id="appointment-signaRequired"
                type="checkbox"
                className="h-4 w-4"
                {...register('signaRequired')}
              />
              <Label htmlFor="appointment-signaRequired" className="mb-0">
                Requiere seña
              </Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-signaAmount">Monto de la seña</Label>
              <Input
                id="appointment-signaAmount"
                type="number"
                min={0}
                step="0.01"
                placeholder="Ej.: 15000"
                disabled={!signaRequired}
                className={errors.signaAmount ? 'border-destructive' : undefined}
                {...register('signaAmount', {
                  setValueAs: (value) =>
                    value === '' || value === null || value === undefined ? null : Number(value),
                })}
              />
              <FieldError message={errors.signaAmount?.message} />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear turno'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
