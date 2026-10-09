'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, apiFetch } from '@/lib/api';
import { patientFullName, type Patient } from '@/lib/patients';
import { PatientForm } from '@/components/patients/patient-form';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

type StatusFilter = '' | 'ACTIVO' | 'ARCHIVADO';

/**
 * Listado de pacientes (SDD, fase 4 / CU-06 y CU-07): alta, búsqueda en
 * servidor por nombre/apellido/DNI/teléfono/email, filtro por estado y
 * archivar/restaurar (nunca borrado físico).
 */
export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVO');
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Patient | null>(null);

  // Debounce de la búsqueda: el filtro se aplica en el backend (CU-07).
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set('query', debouncedQuery);
    if (statusFilter) params.set('status', statusFilter);
    const queryString = params.toString();
    try {
      const list = await apiFetch<Patient[]>(`/patients${queryString ? `?${queryString}` : ''}`);
      setPatients(list);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'No se pudo cargar el listado.');
    }
  }, [debouncedQuery, statusFilter]);

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
        ? `La ficha de ${patientFullName(target)} fue archivada (se conserva el historial).`
        : `La ficha de ${patientFullName(target)} fue reactivada.`,
    );
    await load();
  };

  const showForm = (): void => {
    setNotice(null);
    setShowCreate(true);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Pacientes</h1>
          <p className="text-sm text-muted-foreground">
            Fichas, búsqueda y archivado (CU-06 y CU-07).
          </p>
        </div>
        <Button onClick={showForm} disabled={showCreate}>
          Nuevo paciente
        </Button>
      </header>

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

      {showCreate ? (
        <PatientForm
          onCancel={() => setShowCreate(false)}
          onSaved={(patient) => {
            setNotice(`Ficha de ${patientFullName(patient)} creada correctamente.`);
            setShowCreate(false);
            void load();
          }}
        />
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por apellido, nombre, DNI, teléfono o email…"
            aria-label="Buscar pacientes"
            className="sm:max-w-md"
          />
          <NativeSelect
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="sm:w-48"
          >
            <option value="ACTIVO">Activos</option>
            <option value="ARCHIVADO">Archivados</option>
            <option value="">Todos</option>
          </NativeSelect>
        </div>

        {patients === null && !loadError ? (
          <p className="text-sm text-muted-foreground">Cargando pacientes…</p>
        ) : null}

        {patients !== null && patients.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {statusFilter === 'ACTIVO' && !debouncedQuery
              ? 'Todavía no hay pacientes cargados. Empezá con "Nuevo paciente".'
              : 'Ningún paciente coincide con la búsqueda o el filtro.'}
          </p>
        ) : null}

        {patients !== null && patients.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Paciente</th>
                  <th className="px-4 py-3 font-medium">DNI</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Nacimiento</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/pacientes/ficha?id=${row.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {patientFullName(row)}
                      </Link>
                      {row.email ? (
                        <p className="text-xs text-muted-foreground">{row.email}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{row.dni}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.birthDate
                        ? row.birthDate.slice(0, 10).split('-').reverse().join('/')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={row.status === 'ACTIVO' ? 'success' : 'warning'}>
                        {row.status === 'ACTIVO' ? 'Activo' : 'Archivado'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/pacientes/ficha?id=${row.id}`}>Ver ficha</Link>
                        </Button>
                        <Button
                          variant={row.status === 'ACTIVO' ? 'outline' : 'ghost'}
                          size="sm"
                          onClick={() => {
                            setNotice(null);
                            setArchiveTarget(row);
                          }}
                        >
                          {row.status === 'ACTIVO' ? 'Archivar' : 'Reactivar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={archiveTarget?.status === 'ACTIVO' ? 'Archivar ficha' : 'Reactivar ficha'}
        description={
          archiveTarget === null
            ? ''
            : archiveTarget.status === 'ACTIVO'
              ? `${patientFullName(archiveTarget)} dejará de aparecer en el listado de activos. La ficha y su historia clínica se conservan (nunca se borran) y podrás reactivarla cuando vuelva.`
              : `${patientFullName(archiveTarget)} volverá a figurar como paciente activo.`
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
