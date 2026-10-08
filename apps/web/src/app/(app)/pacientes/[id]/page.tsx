'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/admin';
import { formatDateOnly, patientAge, patientFullName, type Patient } from '@/lib/patients';
import { PatientForm } from '@/components/patients/patient-form';
import { ClinicalRecords } from '@/components/patients/clinical-records';
import { MedicalFiles } from '@/components/patients/medical-files';
import { Odontogram } from '@/components/patients/odontogram';
import { PatientAppointments } from '@/components/agenda/patient-appointments';
import { PatientHistory } from '@/components/audit/patient-history';
import { useAppSession } from '@/components/app-session';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type TabKey = 'datos' | 'historia' | 'odontograma' | 'archivos' | 'turnos' | 'historial';

interface TabDef {
  key: TabKey;
  label: string;
}

/**
 * Pestañas de la ficha (SDD §11): todas operativas desde la fase 9.
 * "Historial" muestra la auditoría del paciente (requiere audit.read).
 */
const TABS: TabDef[] = [
  { key: 'datos', label: 'Datos personales' },
  { key: 'historia', label: 'Historia clínica' },
  { key: 'odontograma', label: 'Odontograma' },
  { key: 'archivos', label: 'Estudios y archivos' },
  { key: 'turnos', label: 'Turnos' },
  { key: 'historial', label: 'Historial' },
];

function DataField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value && value.trim() ? value : '—'}</dd>
    </div>
  );
}

/**
 * Ficha del paciente (SDD, fase 4): datos personales con edición inline,
 * estado (activo/archivado) y pestañas clínicas (historia, odontograma,
 * archivos, turnos e historial de auditoría desde la fase 9).
 */
export default function PatientFilePage() {
  const params = useParams<{ id: string }>();
  const patientId = params.id;
  const { can } = useAppSession();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('datos');
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Patient | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Patient>(`/patients/${patientId}`);
      setPatient(data);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : 'No se pudo cargar la ficha del paciente.',
      );
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleArchive = async (target: Patient): Promise<void> => {
    const archiving = target.status === 'ACTIVO';
    await apiFetch<Patient>(`/patients/${target.id}/${archiving ? 'archive' : 'restore'}`, {
      method: 'POST',
    });
    setNotice(
      archiving
        ? 'Ficha archivada. Se conserva todo el historial; podés reactivarla cuando el paciente vuelva.'
        : 'Ficha reactivada.',
    );
    setEditing(false);
    await load();
  };

  if (loadError && !patient) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href="/pacientes">Volver a pacientes</Link>
        </Button>
      </div>
    );
  }

  if (!patient) {
    return <p className="text-sm text-muted-foreground">Cargando ficha…</p>;
  }

  const age = patientAge(patient.birthDate);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/pacientes">← Volver a pacientes</Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{patientFullName(patient)}</h1>
            <Badge tone={patient.status === 'ACTIVO' ? 'success' : 'warning'}>
              {patient.status === 'ACTIVO' ? 'Activo' : 'Archivado'}
            </Badge>
          </div>
          <div className="flex gap-2">
            {patient.status === 'ACTIVO' ? (
              <Button variant="outline" size="sm" onClick={() => setArchiveTarget(patient)}>
                Archivar
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setArchiveTarget(patient)}>
                Reactivar
              </Button>
            )}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          DNI {patient.dni}
          {age !== null ? ` · ${age} años` : ''}
          {patient.phone ? ` · ${patient.phone}` : ''}
        </p>
      </header>

      {patient.status === 'ARCHIVADO' ? (
        <Alert variant="warning">
          <AlertTitle>Ficha archivada</AlertTitle>
          <AlertDescription>
            Archivada el {formatDateTime(patient.archivedAt)}. La ficha y su historia clínica se
            conservan; reactivá el paciente para seguir operando con normalidad.
          </AlertDescription>
        </Alert>
      ) : null}

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

      <div
        role="tablist"
        aria-label="Secciones de la ficha"
        className="flex flex-wrap gap-1 border-b"
      >
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.key)}
              className={
                active
                  ? 'border-b-2 border-foreground px-3 py-2 text-sm font-medium text-foreground'
                  : 'border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground'
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'datos' ? (
        editing ? (
          <PatientForm
            patient={patient}
            onCancel={() => setEditing(false)}
            onSaved={(saved) => {
              setPatient(saved);
              setEditing(false);
              setNotice('Cambios guardados.');
            }}
          />
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Datos personales</CardTitle>
              <Button size="sm" onClick={() => setEditing(true)}>
                Editar
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">Identidad</h2>
                <dl className="grid gap-4 sm:grid-cols-3">
                  <DataField label="Nombre" value={patient.firstName} />
                  <DataField label="Apellido" value={patient.lastName} />
                  <DataField label="DNI" value={patient.dni} />
                  <DataField
                    label="Fecha de nacimiento"
                    value={formatDateOnly(patient.birthDate)}
                  />
                  <DataField label="Edad" value={age !== null ? `${age} años` : null} />
                </dl>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">Contacto</h2>
                <dl className="grid gap-4 sm:grid-cols-3">
                  <DataField label="Teléfono" value={patient.phone} />
                  <DataField label="Email" value={patient.email} />
                  <DataField label="Contacto de emergencia" value={patient.emergencyContact} />
                  <DataField label="Dirección" value={patient.address} />
                  <DataField label="Localidad" value={patient.locality} />
                  <DataField label="Provincia" value={patient.province} />
                </dl>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">Obra social</h2>
                <dl className="grid gap-4 sm:grid-cols-3">
                  <DataField label="Obra social" value={patient.healthInsurer} />
                  <DataField label="N° de afiliado" value={patient.memberNumber} />
                </dl>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  Antecedentes y observaciones
                </h2>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <DataField label="Alergias" value={patient.allergies} />
                  <DataField label="Medicación actual" value={patient.medications} />
                  <DataField label="Antecedentes" value={patient.background} />
                  <DataField label="Observaciones" value={patient.notes} />
                </dl>
              </section>

              <p className="text-xs text-muted-foreground">
                Ficha creada el {formatDateTime(patient.createdAt)} · Última actualización:{' '}
                {formatDateTime(patient.updatedAt)}
              </p>
            </CardContent>
          </Card>
        )
      ) : activeTab === 'historia' ? (
        <ClinicalRecords patientId={patient.id} />
      ) : activeTab === 'odontograma' ? (
        <Odontogram patientId={patient.id} />
      ) : activeTab === 'archivos' ? (
        <MedicalFiles patientId={patient.id} />
      ) : activeTab === 'turnos' ? (
        <PatientAppointments patient={patient} />
      ) : activeTab === 'historial' ? (
        can('audit.read') ? (
          <PatientHistory patientId={patient.id} />
        ) : (
          <Card>
            <CardContent className="p-8">
              <p className="text-sm text-muted-foreground">
                El historial de auditoría requiere el permiso &quot;audit.read&quot; (solo
                administradores).
              </p>
            </CardContent>
          </Card>
        )
      ) : null}

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={archiveTarget?.status === 'ACTIVO' ? 'Archivar ficha' : 'Reactivar ficha'}
        description={
          archiveTarget?.status === 'ACTIVO'
            ? 'La ficha dejará de figurar en el listado de activos. Los datos, la historia clínica y los archivos se conservan siempre (nunca se borran).'
            : 'El paciente volverá a figurar como activo.'
        }
        confirmLabel={archiveTarget?.status === 'ACTIVO' ? 'Archivar' : 'Reactivar'}
        destructive={archiveTarget?.status === 'ACTIVO'}
        onConfirm={async () => {
          if (archiveTarget) await toggleArchive(archiveTarget);
        }}
      />
    </div>
  );
}
