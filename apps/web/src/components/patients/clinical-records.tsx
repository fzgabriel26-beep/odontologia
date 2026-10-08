'use client';

import { useCallback, useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { createClinicalRecordSchema, type CreateClinicalRecordInput } from '@odonto/validation';
import { ApiError, apiFetch } from '@/lib/api';
import { clinicalAuthorName, formatDateOnly, type ClinicalRecord } from '@/lib/patients';
import { FieldError } from '@/components/form/field-error';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function toServerMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'No fue posible procesar la solicitud.';
}

function applyFieldErrors(
  error: unknown,
  setError: (key: keyof CreateClinicalRecordInput, error: { message: string }) => void,
): boolean {
  if (!(error instanceof ApiError) || !error.fields) return false;
  for (const [key, message] of Object.entries(error.fields)) {
    // Los errores de campo del backend pueden venir como "toothNumbers.0"; el
    // formulario muestra el del campo raíz.
    const rootKey = key.split('.')[0] as keyof CreateClinicalRecordInput;
    setError(rootKey, { message });
  }
  return true;
}

/** Fecha local aaaa-mm-dd (para los inputs type=date/time). */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function nowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** Convierte el texto "11, 21" del input en números FDI (o [] vacío). */
function parseToothNumbers(value: unknown): number[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  return value
    .split(/[\s,;]+/)
    .filter((part) => part !== '')
    .map(Number);
}

/* ------------------------------------------------------------------ */
/* Formulario de nueva evolución                                       */
/* ------------------------------------------------------------------ */

function ClinicalRecordForm({
  patientId,
  onCancel,
  onCreated,
}: {
  patientId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateClinicalRecordInput>({
    resolver: zodResolver(createClinicalRecordSchema),
    defaultValues: {
      date: todayIso(),
      time: nowTime(),
      reason: '',
      diagnosis: '',
      treatment: '',
      observations: '',
      indications: '',
      toothNumbers: [],
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await apiFetch<ClinicalRecord>(`/patients/${patientId}/records`, {
        method: 'POST',
        body: values,
      });
      onCreated();
    } catch (error) {
      if (!applyFieldErrors(error, setError)) {
        setServerError(toServerMessage(error));
      }
    }
  });

  const textField = (
    name: 'reason' | 'diagnosis' | 'treatment' | 'observations' | 'indications',
    label: string,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`record-${name}`}>{label}</Label>
      <Textarea id={`record-${name}`} {...register(name)} />
      <FieldError message={errors[name]?.message} />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva evolución</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {serverError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="record-date">Fecha</Label>
              <Input id="record-date" type="date" {...register('date')} />
              <FieldError message={errors.date?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="record-time">Hora</Label>
              <Input id="record-time" type="time" {...register('time')} />
              <FieldError message={errors.time?.message} />
            </div>
          </div>

          {textField('reason', 'Motivo')}
          <div className="grid gap-4 sm:grid-cols-2">
            {textField('diagnosis', 'Diagnóstico')}
            {textField('treatment', 'Tratamiento')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {textField('observations', 'Observaciones')}
            {textField('indications', 'Indicaciones')}
          </div>

          <div className="space-y-2">
            <Label htmlFor="record-toothNumbers">Dientes (FDI)</Label>
            <Input
              id="record-toothNumbers"
              placeholder="Ej.: 11, 21, 36"
              autoComplete="off"
              {...register('toothNumbers', { setValueAs: parseToothNumbers })}
            />
            <FieldError message={errors.toothNumbers?.message} />
            <p className="text-xs text-muted-foreground">
              Opcional. Números FDI separados por comas (32 permanentes 11–48, 20 temporales 51–85).
            </p>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Registrar evolución'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Listado de evoluciones                                              */
/* ------------------------------------------------------------------ */

function RecordEntry({
  record,
  onArchive,
}: {
  record: ClinicalRecord;
  onArchive: (record: ClinicalRecord) => void;
}) {
  const details: Array<{ label: string; value: string | null }> = [
    { label: 'Motivo', value: record.reason },
    { label: 'Diagnóstico', value: record.diagnosis },
    { label: 'Tratamiento', value: record.treatment },
    { label: 'Observaciones', value: record.observations },
    { label: 'Indicaciones', value: record.indications },
  ].filter((item) => item.value !== null && item.value.trim() !== '');

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {formatDateOnly(record.date)} · {record.time}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Por {clinicalAuthorName(record.createdBy)}
          </span>
          <Button variant="outline" size="sm" onClick={() => onArchive(record)}>
            Archivar
          </Button>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        {details.map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="whitespace-pre-wrap text-sm">{item.value}</dd>
          </div>
        ))}
      </dl>

      {record.toothNumbers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Dientes:</span>
          {record.toothNumbers.map((fdi) => (
            <Badge key={fdi} tone="info">
              {fdi}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Evoluciones de la historia clínica (SDD, fase 5 / CU-08): consulta ordenada
 * con autor visible, alta validada y archivado sin borrado físico.
 */
export function ClinicalRecords({ patientId }: { patientId: string }) {
  const [records, setRecords] = useState<ClinicalRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ClinicalRecord | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<ClinicalRecord[]>(`/patients/${patientId}/records`);
      setRecords(list);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : 'No se pudo cargar la historia clínica.',
      );
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const archive = async (target: ClinicalRecord): Promise<void> => {
    await apiFetch<ClinicalRecord>(`/patients/${patientId}/records/${target.id}/archive`, {
      method: 'POST',
    });
    setNotice('Evolución archivada (se conserva en la base y en la auditoría).');
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Evoluciones ordenadas de más reciente a más antigua. Nunca se borran: solo se archivan.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setNotice(null);
            setShowForm(true);
          }}
          disabled={showForm}
        >
          Nueva evolución
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

      {showForm ? (
        <ClinicalRecordForm
          patientId={patientId}
          onCancel={() => setShowForm(false)}
          onCreated={() => {
            setNotice('Evolución registrada correctamente.');
            setShowForm(false);
            void load();
          }}
        />
      ) : null}

      {records === null && !loadError ? (
        <p className="text-sm text-muted-foreground">Cargando evoluciones…</p>
      ) : null}

      {records !== null && records.length === 0 && !showForm ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay evoluciones registradas. Usá “Nueva evolución” para empezar.
        </p>
      ) : null}

      {records !== null && records.length > 0 ? (
        <div className="space-y-3">
          {records.map((record) => (
            <RecordEntry key={record.id} record={record} onArchive={setArchiveTarget} />
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title="Archivar evolución"
        description="La evolución dejará de mostrarse en la historia clínica. El registro se conserva en la base de datos y queda asentado en la auditoría (nunca se borra)."
        confirmLabel="Archivar"
        onConfirm={async () => {
          if (archiveTarget) await archive(archiveTarget);
        }}
      />
    </div>
  );
}
