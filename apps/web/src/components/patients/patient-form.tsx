'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { createPatientSchema, type CreatePatientInput } from '@odonto/validation';
import { ApiError, apiFetch } from '@/lib/api';
import type { Patient } from '@/lib/patients';
import { FieldError } from '@/components/form/field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function toServerMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'No fue posible procesar la solicitud.';
}

/** Rellena los errores por campo si el backend los devolvió (la validación Zod corre también acá). */
function applyFieldErrors(
  error: unknown,
  setError: (key: keyof CreatePatientInput, error: { message: string }) => void,
): boolean {
  if (!(error instanceof ApiError) || !error.fields) return false;
  for (const [key, message] of Object.entries(error.fields)) {
    setError(key as keyof CreatePatientInput, { message });
  }
  return true;
}

/** Convierte null de la base en '' para los inputs controlados. */
function toFormValue(value: string | null): string {
  return value ?? '';
}

interface PatientFormProps {
  /** Si se pasa, el formulario edita la ficha existente; si no, crea una nueva. */
  patient?: Patient;
  onCancel: () => void;
  onSaved: (patient: Patient) => void;
}

/**
 * Alta y edición de fichas de paciente (SDD, fase 4 / CU-06).
 * Usa el esquema Zod compartido con el backend; todo se revalida en servidor.
 */
export function PatientForm({ patient, onCancel, onSaved }: PatientFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = patient !== undefined;
  const prefix = isEdit ? 'patient-edit' : 'patient-create';

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreatePatientInput>({
    resolver: zodResolver(createPatientSchema),
    defaultValues: {
      firstName: patient?.firstName ?? '',
      lastName: patient?.lastName ?? '',
      dni: patient?.dni ?? '',
      // El input date solo acepta aaaa-mm-dd (la API devuelve ISO datetime).
      birthDate: patient?.birthDate ? patient.birthDate.slice(0, 10) : '',
      phone: toFormValue(patient?.phone ?? null),
      email: toFormValue(patient?.email ?? null),
      address: toFormValue(patient?.address ?? null),
      locality: toFormValue(patient?.locality ?? null),
      province: toFormValue(patient?.province ?? null),
      emergencyContact: toFormValue(patient?.emergencyContact ?? null),
      healthInsurer: toFormValue(patient?.healthInsurer ?? null),
      memberNumber: toFormValue(patient?.memberNumber ?? null),
      allergies: toFormValue(patient?.allergies ?? null),
      medications: toFormValue(patient?.medications ?? null),
      background: toFormValue(patient?.background ?? null),
      notes: toFormValue(patient?.notes ?? null),
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const saved = isEdit
        ? await apiFetch<Patient>(`/patients/${patient.id}`, { method: 'PATCH', body: values })
        : await apiFetch<Patient>('/patients', { method: 'POST', body: values });
      onSaved(saved);
    } catch (error) {
      if (!applyFieldErrors(error, setError)) {
        setServerError(toServerMessage(error));
      }
    }
  });

  const textField = (
    name: keyof CreatePatientInput,
    label: string,
    extra?: { inputMode?: 'numeric'; type?: string },
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`${prefix}-${name}`}>{label}</Label>
      <Input
        id={`${prefix}-${name}`}
        type={extra?.type}
        inputMode={extra?.inputMode}
        autoComplete="off"
        {...register(name)}
      />
      <FieldError message={errors[name]?.message} />
    </div>
  );

  const areaField = (name: keyof CreatePatientInput, label: string) => (
    <div className="space-y-2">
      <Label htmlFor={`${prefix}-${name}`}>{label}</Label>
      <Textarea id={`${prefix}-${name}`} {...register(name)} />
      <FieldError message={errors[name]?.message} />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEdit ? `Editar: ${patient.firstName} ${patient.lastName}` : 'Nuevo paciente'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          {serverError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">Identidad</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {textField('firstName', 'Nombre')}
              {textField('lastName', 'Apellido')}
              {textField('dni', 'DNI', { inputMode: 'numeric' })}
              {textField('birthDate', 'Fecha de nacimiento', { type: 'date' })}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">Contacto</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {textField('phone', 'Teléfono')}
              {textField('email', 'Email', { type: 'email' })}
              {textField('address', 'Dirección')}
              {textField('locality', 'Localidad')}
              {textField('province', 'Provincia')}
              {textField('emergencyContact', 'Contacto de emergencia')}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">Obra social</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {textField('healthInsurer', 'Obra social')}
              {textField('memberNumber', 'N° de afiliado')}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">
              Antecedentes y observaciones
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {areaField('allergies', 'Alergias')}
              {areaField('medications', 'Medicación actual')}
            </div>
            {areaField('background', 'Antecedentes')}
            {areaField('notes', 'Observaciones')}
          </section>

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear paciente'}
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
