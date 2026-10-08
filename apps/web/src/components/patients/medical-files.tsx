'use client';

import { useCallback, useEffect, useState } from 'react';
import { FILE_KINDS, FILE_KIND_LABELS } from '@odonto/types';
import { ApiError, apiFetch } from '@/lib/api';
import {
  fileContentUrl,
  fileUploaderName,
  formatFileSize,
  type MedicalFile,
  type Tooth,
} from '@/lib/patients';
import { formatDateTime } from '@/lib/admin';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

function toServerMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'No fue posible procesar la solicitud.';
}

/* ------------------------------------------------------------------ */
/* Formulario de subida (multipart)                                    */
/* ------------------------------------------------------------------ */

function FileUploadForm({
  patientId,
  teeth,
  onCancel,
  onUploaded,
}: {
  patientId: string;
  teeth: Tooth[];
  onCancel: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<string>('RADIOGRAFIA');
  const [description, setDescription] = useState('');
  const [toothId, setToothId] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allowedExtensions = '.png,.jpg,.jpeg,.webp,.dcm,.pdf';

  const onSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setServerError(null);
    setFileError(null);

    if (!file) {
      setFileError('Elegí un archivo para subir.');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', kind);
      if (description.trim()) formData.append('description', description.trim());
      if (toothId) formData.append('toothId', toothId);
      await apiFetch<MedicalFile>(`/patients/${patientId}/files`, {
        method: 'POST',
        body: formData,
      });
      onUploaded();
    } catch (error) {
      // El backend valida extensión/MIME/tamaño y responde en español.
      const fields = error instanceof ApiError ? error.fields : undefined;
      if (fields?.file) setFileError(fields.file);
      setServerError(toServerMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subir archivo</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
          {serverError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="file-upload">Archivo</Label>
            <Input
              id="file-upload"
              type="file"
              accept={allowedExtensions}
              className={fileError ? 'border-destructive' : undefined}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setFileError(null);
              }}
            />
            {fileError ? (
              <p className="text-xs font-medium text-destructive">{fileError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Formatos permitidos: .png, .jpg, .jpeg, .webp, .dcm (DICOM) y .pdf · Máximo 25 MB.
                El contenido se verifica en el servidor (magic bytes).
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="file-kind">Tipo</Label>
              <NativeSelect
                id="file-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {FILE_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {FILE_KIND_LABELS[value]}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file-tooth">Diente (opcional)</Label>
              <NativeSelect
                id="file-tooth"
                value={toothId}
                onChange={(event) => setToothId(event.target.value)}
              >
                <option value="">Sin diente específico</option>
                {teeth.map((tooth) => (
                  <option key={tooth.id} value={tooth.id}>
                    {tooth.fdiNumber}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-description">Descripción (opcional)</Label>
            <Input
              id="file-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ej.: Radiografía de control anual"
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Subiendo…' : 'Subir archivo'}
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
/* Listado de archivos                                                 */
/* ------------------------------------------------------------------ */

function FileEntry({
  file,
  onArchive,
}: {
  file: MedicalFile;
  onArchive: (file: MedicalFile) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-background p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* Vista previa en el navegador (proxy inline autenticado). */}
          <a
            href={fileContentUrl(file.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="max-w-[20rem] truncate text-sm font-medium underline-offset-2 hover:underline"
            title={`Ver ${file.originalName}`}
          >
            {file.name}
          </a>
          <Badge tone="info">{FILE_KIND_LABELS[file.kind]}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(file.size)} · {file.mimeType} · {formatDateTime(file.createdAt)} · Subido
          por {fileUploaderName(file.uploadedBy)}
        </p>
        {file.description ? (
          <p className="text-sm text-muted-foreground">{file.description}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" asChild>
          {/* Descarga forzada con Content-Disposition: attachment. */}
          <a href={fileContentUrl(file.id, 'attachment')} download={file.originalName}>
            Descargar
          </a>
        </Button>
        <Button variant="outline" size="sm" onClick={() => onArchive(file)}>
          Archivar
        </Button>
      </div>
    </div>
  );
}

/**
 * Estudios y archivos (SDD, fase 7 / CU-10): subida con validación de
 * extensión/MIME/tamaño, listado con visualización y descarga por proxy
 * autenticado (nunca URLs públicas) y archivado sin borrado físico.
 */
export function MedicalFiles({ patientId }: { patientId: string }) {
  const [files, setFiles] = useState<MedicalFile[] | null>(null);
  const [teeth, setTeeth] = useState<Tooth[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<MedicalFile | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<MedicalFile[]>(`/patients/${patientId}/files`);
      setFiles(list);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : 'No se pudieron cargar los archivos.',
      );
    }
  }, [patientId]);

  // Dientes para asociar al subir (best effort: sin ellos se omite el select).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiFetch<Tooth[]>(`/patients/${patientId}/teeth`);
        if (!cancelled) setTeeth(list);
      } catch {
        if (!cancelled) setTeeth([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const archive = async (target: MedicalFile): Promise<void> => {
    await apiFetch<MedicalFile>(`/files/${target.id}/archive`, { method: 'POST' });
    setNotice('Archivo archivado (el binario se conserva; nunca se borra).');
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Estudios privados del paciente. Se sirven siempre por el backend con sesión y permiso;
          nunca hay enlaces públicos.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setNotice(null);
            setShowForm(true);
          }}
          disabled={showForm}
        >
          Subir archivo
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
        <FileUploadForm
          patientId={patientId}
          teeth={teeth}
          onCancel={() => setShowForm(false)}
          onUploaded={() => {
            setNotice('Archivo subido correctamente.');
            setShowForm(false);
            void load();
          }}
        />
      ) : null}

      {files === null && !loadError ? (
        <p className="text-sm text-muted-foreground">Cargando archivos…</p>
      ) : null}

      {files !== null && files.length === 0 && !showForm ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay archivos cargados. Usá “Subir archivo” para adjuntar el primer estudio.
        </p>
      ) : null}

      {files !== null && files.length > 0 ? (
        <div className="space-y-3">
          {files.map((file) => (
            <FileEntry key={file.id} file={file} onArchive={setArchiveTarget} />
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title="Archivar archivo"
        description="El archivo dejará de figurar en el listado. El registro y el binario se conservan en el almacenamiento privado y la acción queda asentada en la auditoría (nunca se borra)."
        confirmLabel="Archivar"
        destructive
        onConfirm={async () => {
          if (archiveTarget) await archive(archiveTarget);
        }}
      />
    </div>
  );
}
