import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ALLOWED_FILE_EXTENSIONS, type FileKind } from '@odonto/types';
import type { UploadFileFieldsInput, UploadToToothFieldsInput } from '@odonto/validation';
import type { Readable } from 'node:stream';
import { AuditService } from '../audit/audit.service';
import {
  fileExtensionOf,
  mimeForExtension,
  sniffMime,
  type SniffedMime,
} from '../common/utils/file-signature';
import { maxUploadBytes, maxUploadMb } from '../common/utils/upload-limit';
import type { MedicalFile } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage-provider';

/** Ejecutor de la acción (para auditoría). */
export interface FileActor {
  id: string;
  ip?: string;
}

/** Subconjunto del archivo multipart que necesita el servicio. */
export interface UploadedFilePayload {
  originalname: string;
  buffer: Buffer;
}

/** Archivo con el subidor visible (SDD, fase 7). */
export type MedicalFileWithUploader = MedicalFile & {
  uploadedBy: { id: string; firstName: string; lastName: string };
};

interface UploadFields {
  kind: FileKind;
  description?: string | null;
}

const AUTHOR_SELECT = { id: true, firstName: true, lastName: true } as const;

/** '' o null → null; undefined → no tocar el campo (Prisma lo ignora). */
function toDbText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === '' ? null : value;
}

/** Solo el nombre base (sin rutas del cliente) recortado a 255. */
function baseNameOf(originalName: string): string {
  return (originalName.split(/[\\/]/).pop() ?? originalName).slice(0, 255);
}

/** Nombre visible saneado: sin caracteres de ruta ni especiales raros. */
function sanitizeFileName(originalName: string): string {
  const cleaned = baseNameOf(originalName)
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\p{L}\p{N}._ ()-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'archivo').slice(0, 255);
}

/**
 * Archivos médicos (SDD, fase 7 / CU-10): subida con validación de extensión
 * (whitelist), tamaño (MAX_UPLOAD_MB) y magic bytes; metadatos en BD con
 * `storageKey` del servidor; binarios en el bucket privado (nunca públicos);
 * descarga solo por proxy autenticado; archivado sin borrado físico.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private async findPatientOrFail(patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException({
        error: {
          code: 'PATIENT_NOT_FOUND',
          message: 'No existe un paciente con ese identificador.',
        },
      });
    }
  }

  private async findToothOrFail(toothId: string): Promise<{ id: string; patientId: string }> {
    const tooth = await this.prisma.tooth.findUnique({
      where: { id: toothId },
      select: { id: true, patientId: true },
    });
    if (!tooth) {
      throw new NotFoundException({
        error: {
          code: 'TOOTH_NOT_FOUND',
          message: 'No existe un diente con ese identificador.',
        },
      });
    }
    return tooth;
  }

  /** Valida extensión (whitelist), tamaño y magic bytes; devuelve el MIME real. */
  private validateUpload(file: UploadedFilePayload | undefined): {
    mime: SniffedMime;
    ext: string;
    buffer: Buffer;
    originalName: string;
  } {
    if (!file || file.buffer.length === 0) {
      throw new BadRequestException({
        error: {
          code: 'FILE_REQUIRED',
          message: 'Adjuntá un archivo para subir.',
          fields: { file: 'Adjuntá un archivo para subir.' },
        },
      });
    }

    const ext = fileExtensionOf(file.originalname);
    if (!ALLOWED_FILE_EXTENSIONS.includes(ext as (typeof ALLOWED_FILE_EXTENSIONS)[number])) {
      throw new BadRequestException({
        error: {
          code: 'FILE_EXTENSION_NOT_ALLOWED',
          message: `Extensión no permitida. Extensiones admitidas: ${ALLOWED_FILE_EXTENSIONS.join(', ')}.`,
          fields: { file: 'Extensión no permitida.' },
        },
      });
    }

    const limit = maxUploadBytes();
    if (file.buffer.length > limit) {
      throw new BadRequestException({
        error: {
          code: 'FILE_TOO_LARGE',
          message: `El archivo supera el máximo permitido de ${maxUploadMb()} MB.`,
          fields: { file: `Máximo ${maxUploadMb()} MB.` },
        },
      });
    }

    // El MIME declarado por el cliente nunca se confía: manda el contenido.
    const detected = sniffMime(file.buffer);
    if (!detected) {
      throw new BadRequestException({
        error: {
          code: 'FILE_CONTENT_INVALID',
          message: 'El contenido del archivo no coincide con ningún formato permitido.',
          fields: { file: 'Contenido de archivo inválido.' },
        },
      });
    }

    const expected = mimeForExtension(ext);
    if (detected !== expected) {
      throw new BadRequestException({
        error: {
          code: 'FILE_TYPE_MISMATCH',
          message: 'El contenido del archivo no coincide con su extensión.',
          fields: { file: 'El contenido no corresponde a la extensión.' },
        },
      });
    }

    return { mime: detected, ext, buffer: file.buffer, originalName: file.originalname };
  }

  /** Escribe el blob y crea el registro; si la BD falla, retira el blob. */
  private async storeFile(
    patientId: string,
    toothId: string | null,
    file: UploadedFilePayload | undefined,
    fields: UploadFields,
    actor: FileActor,
  ): Promise<MedicalFileWithUploader> {
    const { mime, ext, buffer, originalName } = this.validateUpload(file);

    // Clave generada por el servidor (nunca la provee el cliente).
    const storageKey = `patients/${patientId}/${randomUUID()}${ext}`;
    const originalNameBase = baseNameOf(originalName);
    const name = sanitizeFileName(originalNameBase);

    await this.storage.put(storageKey, buffer, mime);

    let created: MedicalFileWithUploader;
    try {
      created = await this.prisma.medicalFile.create({
        data: {
          patientId,
          toothId,
          name,
          originalName: originalNameBase,
          kind: fields.kind,
          mimeType: mime,
          size: buffer.length,
          storageKey,
          description: toDbText(fields.description),
          uploadedById: actor.id,
        },
        include: { uploadedBy: { select: AUTHOR_SELECT } },
      });
    } catch (error) {
      // No dejar huérfanos en el bucket si la escritura en BD falla.
      await this.storage.delete(storageKey);
      throw error;
    }

    // Sin texto libre del usuario en auditoría (solo datos técnicos).
    await this.audit.log({
      userId: actor.id,
      action: 'FILE_UPLOADED',
      entityType: 'MEDICAL_FILE',
      entityId: created.id,
      metadata: {
        patientId,
        toothId,
        kind: fields.kind,
        size: created.size,
        mimeType: mime,
      },
      ip: actor.ip,
    });
    return created;
  }

  /** Subida a nivel paciente (el diente es opcional). */
  async uploadToPatient(
    patientId: string,
    file: UploadedFilePayload | undefined,
    fields: UploadFileFieldsInput,
    actor: FileActor,
  ): Promise<MedicalFileWithUploader> {
    await this.findPatientOrFail(patientId);

    let toothId: string | null = null;
    const requestedTooth = fields.toothId && fields.toothId !== '' ? fields.toothId : null;
    if (requestedTooth) {
      const tooth = await this.prisma.tooth.findUnique({
        where: { id: requestedTooth },
        select: { id: true, patientId: true },
      });
      // 404 también si el diente pertenece a otro paciente (no se filtra su existencia).
      if (!tooth || tooth.patientId !== patientId) {
        throw new NotFoundException({
          error: {
            code: 'TOOTH_NOT_FOUND',
            message: 'No existe un diente con ese identificador en este paciente.',
          },
        });
      }
      toothId = tooth.id;
    }

    return this.storeFile(patientId, toothId, file, fields, actor);
  }

  /** Subida asociada a un diente (CU-10): paciente heredado del diente. */
  async uploadToTooth(
    toothId: string,
    file: UploadedFilePayload | undefined,
    fields: UploadToToothFieldsInput,
    actor: FileActor,
  ): Promise<MedicalFileWithUploader> {
    const tooth = await this.findToothOrFail(toothId);
    return this.storeFile(tooth.patientId, tooth.id, file, fields, actor);
  }

  /** Metadatos del paciente: excluye archivados (el archivado sale de circulación). */
  async listPatientFiles(patientId: string): Promise<MedicalFileWithUploader[]> {
    await this.findPatientOrFail(patientId);
    return this.prisma.medicalFile.findMany({
      where: { patientId, archivedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: AUTHOR_SELECT } },
    });
  }

  /** Metadatos de un archivo puntual (incluye archivados). */
  async getFile(fileId: string): Promise<MedicalFileWithUploader> {
    const file = await this.prisma.medicalFile.findUnique({
      where: { id: fileId },
      include: { uploadedBy: { select: AUTHOR_SELECT } },
    });
    if (!file) {
      throw new NotFoundException({
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'No existe un archivo con ese identificador.',
        },
      });
    }
    return file;
  }

  /**
   * Proxy de descarga/visualización (SDD §4.6): devuelve el stream del bucket
   * privado y audita el acceso (FILE_DOWNLOADED). Nunca hay URL pública.
   */
  async openFile(
    fileId: string,
    actor: FileActor,
  ): Promise<{ file: MedicalFileWithUploader; stream: Readable }> {
    const file = await this.getFile(fileId);
    const stream = await this.storage.getStream(file.storageKey);
    await this.audit.log({
      userId: actor.id,
      action: 'FILE_DOWNLOADED',
      entityType: 'MEDICAL_FILE',
      entityId: file.id,
      metadata: { patientId: file.patientId, kind: file.kind, size: file.size },
      ip: actor.ip,
    });
    return { file, stream };
  }

  /** Archivado lógico (auditado); el blob nunca se borra. */
  async archiveFile(fileId: string, actor: FileActor): Promise<MedicalFileWithUploader> {
    const file = await this.getFile(fileId);
    if (file.archivedAt) {
      throw new ConflictException({
        error: { code: 'FILE_ARCHIVED', message: 'El archivo ya está archivado.' },
      });
    }

    const updated = await this.prisma.medicalFile.update({
      where: { id: fileId },
      data: { archivedAt: new Date() },
      include: { uploadedBy: { select: AUTHOR_SELECT } },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'FILE_ARCHIVED',
      entityType: 'MEDICAL_FILE',
      entityId: file.id,
      metadata: { patientId: file.patientId, kind: file.kind },
      ip: actor.ip,
    });
    return updated;
  }
}
