'use client';

import { useCallback, useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { createToothEventSchema, type CreateToothEventInput } from '@odonto/validation';
import { ApiError, apiDownload, apiFetch } from '@/lib/api';
import { formatDateOnly, toothEventAuthorName, type Tooth, type ToothEvent } from '@/lib/patients';
import {
  OdontogramLegend,
  OdontogramSvg,
  ToothStatusChip,
} from '@/components/patients/odontogram-svg';
import { FieldError } from '@/components/form/field-error';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { TOOTH_STATUSES, TOOTH_STATUS_LABELS } from '@odonto/types';

function toServerMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'No fue posible procesar la solicitud.';
}

/** Rellena los errores por campo; 'form' del backend va a raíz (errors.root). */
function applyFieldErrors(
  error: unknown,
  setError: (key: 'status' | 'note' | 'eventDate' | 'root', error: { message: string }) => void,
): boolean {
  if (!(error instanceof ApiError) || !error.fields) return false;
  for (const [key, message] of Object.entries(error.fields)) {
    const rootKey = key.split('.')[0];
    if (rootKey === 'form') {
      setError('root', { message });
    } else {
      setError(rootKey as 'status' | 'note' | 'eventDate', { message });
    }
  }
  return true;
}

/** Fecha local aaaa-mm-dd para el input type=date. */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Formulario de nuevo evento dental                                   */
/* ------------------------------------------------------------------ */

function EventForm({ toothId, onSaved }: { toothId: string; onSaved: () => Promise<void> }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateToothEventInput>({
    resolver: zodResolver(createToothEventSchema),
    defaultValues: { eventDate: todayIso(), note: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await apiFetch<ToothEvent>(`/teeth/${toothId}/events`, { method: 'POST', body: values });
      reset();
      await onSaved();
    } catch (error) {
      if (!applyFieldErrors(error, setError)) {
        setServerError(toServerMessage(error));
      }
    }
  });

  const rootError = errors.root?.message;

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      {serverError || rootError ? (
        <Alert variant="destructive">
          <AlertDescription>{serverError ?? rootError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tooth-event-status">Estado</Label>
          <NativeSelect id="tooth-event-status" {...register('status')}>
            <option value="">Elegí un estado…</option>
            {TOOTH_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TOOTH_STATUS_LABELS[status]}
              </option>
            ))}
          </NativeSelect>
          <FieldError message={errors.status?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tooth-event-date">Fecha</Label>
          <Input id="tooth-event-date" type="date" {...register('eventDate')} />
          <FieldError message={errors.eventDate?.message} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tooth-event-note">Nota (opcional)</Label>
        <Textarea id="tooth-event-note" rows={2} {...register('note')} />
        <FieldError message={errors.note?.message} />
      </div>

      <Button type="submit" size="sm" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : 'Registrar evento'}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Panel lateral del diente seleccionado                               */
/* ------------------------------------------------------------------ */

function ToothPanel({
  tooth,
  events,
  eventsError,
  onEventSaved,
  onObservationsSaved,
}: {
  tooth: Tooth;
  events: ToothEvent[] | null;
  eventsError: string | null;
  onEventSaved: () => Promise<void>;
  onObservationsSaved: () => Promise<void>;
}) {
  const [editingObs, setEditingObs] = useState(false);
  const [obsValue, setObsValue] = useState(tooth.observations ?? '');
  const [obsSaving, setObsSaving] = useState(false);
  const [obsError, setObsError] = useState<string | null>(null);

  const saveObservations = async () => {
    setObsSaving(true);
    setObsError(null);
    try {
      await apiFetch<Tooth>(`/teeth/${tooth.id}`, {
        method: 'PATCH',
        body: { observations: obsValue },
      });
      setEditingObs(false);
      await onObservationsSaved();
    } catch (error) {
      setObsError(
        error instanceof ApiError ? error.message : 'No se pudieron guardar las observaciones.',
      );
    } finally {
      setObsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Diente {tooth.fdiNumber}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{tooth.type === 'PERMANENTE' ? 'Permanente' : 'Temporal'}</Badge>
          <ToothStatusChip status={tooth.currentStatus} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Observaciones del diente */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Observaciones</h4>
            {!editingObs ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setObsValue(tooth.observations ?? '');
                  setObsError(null);
                  setEditingObs(true);
                }}
              >
                Editar
              </Button>
            ) : null}
          </div>
          {editingObs ? (
            <div className="space-y-2">
              <Textarea
                value={obsValue}
                onChange={(event) => setObsValue(event.target.value)}
                rows={3}
                placeholder="Observaciones del diente…"
                aria-label="Observaciones del diente"
              />
              {obsError ? <FieldError message={obsError} /> : null}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void saveObservations()} disabled={obsSaving}>
                  {obsSaving ? 'Guardando…' : 'Guardar'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingObs(false);
                    setObsError(null);
                  }}
                  disabled={obsSaving}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {tooth.observations?.trim() ? tooth.observations : 'Sin observaciones.'}
            </p>
          )}
        </section>

        {/* Registrar evento (CU-09) */}
        <section className="space-y-2">
          <h4 className="text-sm font-medium">Registrar evento</h4>
          <EventForm toothId={tooth.id} onSaved={onEventSaved} />
        </section>

        {/* Historial del diente */}
        <section className="space-y-2">
          <h4 className="text-sm font-medium">Historial</h4>
          {eventsError ? (
            <Alert variant="destructive">
              <AlertDescription>{eventsError}</AlertDescription>
            </Alert>
          ) : null}
          {events === null && !eventsError ? (
            <p className="text-xs text-muted-foreground">Cargando historial…</p>
          ) : null}
          {events?.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sin eventos registrados todavía. Usá “Registrar evento” para empezar.
            </p>
          ) : null}
          {events && events.length > 0 ? (
            <ol className="space-y-2">
              {events.map((event) => (
                <li key={event.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{formatDateOnly(event.eventDate)}</span>
                    <ToothStatusChip status={event.status} />
                  </div>
                  {event.note?.trim() ? (
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{event.note}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Por {toothEventAuthorName(event.createdBy)}
                  </p>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Contenedor del odontograma                                          */
/* ------------------------------------------------------------------ */

/**
 * Odontograma FDI interactivo (SDD, fase 6 / CU-09): SVG con los 52 dientes
 * seleccionables, panel lateral con estado actual, observaciones, registro de
 * eventos (que actualizan el estado) e historial por diente con autor.
 */
export function Odontogram({ patientId }: { patientId: string }) {
  const [teeth, setTeeth] = useState<Tooth[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<ToothEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const selected = teeth?.find((tooth) => tooth.id === selectedId) ?? null;

  const loadTeeth = useCallback(async () => {
    try {
      const list = await apiFetch<Tooth[]>(`/patients/${patientId}/teeth`);
      setTeeth(list);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'No se pudo cargar el odontograma.');
    }
  }, [patientId]);

  const loadEvents = useCallback(async (toothId: string) => {
    setEvents(null);
    try {
      const list = await apiFetch<ToothEvent[]>(`/teeth/${toothId}/events`);
      setEvents(list);
      setEventsError(null);
    } catch (error) {
      setEventsError(error instanceof ApiError ? error.message : 'No se pudo cargar el historial.');
    }
  }, []);

  useEffect(() => {
    void loadTeeth();
  }, [loadTeeth]);

  useEffect(() => {
    if (selectedId === null) {
      setEvents(null);
      setEventsError(null);
      return;
    }
    void loadEvents(selectedId);
  }, [selectedId, loadEvents]);

  const handleEventSaved = useCallback(async () => {
    setNotice('Evento registrado: el estado del diente se actualizó.');
    await loadTeeth();
    if (selectedId !== null) {
      await loadEvents(selectedId);
    }
  }, [loadTeeth, loadEvents, selectedId]);

  const handleObservationsSaved = useCallback(async () => {
    setNotice('Observaciones del diente guardadas.');
    await loadTeeth();
  }, [loadTeeth]);

  /** Exporta el PDF en el backend (ADR-004) y lo descarga con nombre sugerido. */
  const handleExportPdf = useCallback(async () => {
    setExportingPdf(true);
    setPdfError(null);
    try {
      const { blob, filename } = await apiDownload(`/patients/${patientId}/odontogram.pdf`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? 'odontograma.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Se libera después de iniciar la descarga (algunos navegadores lo
      // necesitan; si el componente se desmonta, el timeout igual se cumple).
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setNotice('PDF del odontograma generado y descargado.');
    } catch (error) {
      setPdfError(toServerMessage(error));
    } finally {
      setExportingPdf(false);
    }
  }, [patientId]);

  return (
    <div className="space-y-4">
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

      {pdfError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo exportar</AlertTitle>
          <AlertDescription>{pdfError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Odontograma FDI</CardTitle>
              <p className="text-sm text-muted-foreground">
                Hacé clic en un diente (o usá Tab + Enter) para ver su estado, observaciones e
                historial.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setNotice(null);
                void handleExportPdf();
              }}
              disabled={exportingPdf}
            >
              {exportingPdf ? 'Generando PDF…' : 'Exportar PDF'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {teeth === null && !loadError ? (
              <p className="text-sm text-muted-foreground">Cargando odontograma…</p>
            ) : null}
            {teeth !== null ? (
              <OdontogramSvg
                teeth={teeth}
                selectedId={selectedId}
                onSelect={(tooth) => {
                  setNotice(null);
                  setSelectedId(tooth.id);
                }}
              />
            ) : null}
            <div className="border-t pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Leyenda de estados</p>
              <OdontogramLegend />
            </div>
          </CardContent>
        </Card>

        <div>
          {selected ? (
            <ToothPanel
              key={selected.id}
              tooth={selected}
              events={events}
              eventsError={eventsError}
              onEventSaved={handleEventSaved}
              onObservationsSaved={handleObservationsSaved}
            />
          ) : (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">
                  Seleccioná un diente del odontograma para ver su estado actual, editar
                  observaciones, registrar un evento y consultar el historial.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
