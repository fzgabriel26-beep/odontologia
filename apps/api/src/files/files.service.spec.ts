import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Readable } from 'node:stream';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage-provider';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { FilesService, type UploadedFilePayload } from './files.service';

/**
 * Tests de integración de archivos médicos (SDD, fase 7 / CU-10): subida con
 * validación de extensión/tamaño/magic bytes, asociación paciente+diente,
 * proxy de descarga con auditoría y archivado sin borrado físico. Requiere BD
 * migrada con seed (roles + admin) y STORAGE_DRIVER=fs (default).
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

async function expectApiError(promise: Promise<unknown>, code: string): Promise<void> {
  const caught = await promise.then(
    () => {
      throw new Error(`Se esperaba el error ${code} pero la operación resolvió correctamente.`);
    },
    (error: unknown) => error,
  );
  expect(caught).toBeInstanceOf(HttpException);
  const body = (caught as HttpException).getResponse() as { error?: { code?: string } };
  expect(body.error?.code).toBe(code);
}

/* --- activos de prueba (magic bytes reales) --- */
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const PDF_BYTES = Buffer.from(`%PDF-1.4\n${'x'.repeat(64)}\n%%EOF`);
const DICOM_BYTES = (() => {
  const buffer = Buffer.alloc(256, 0);
  buffer.write('DICM', 128, 'latin1');
  return buffer;
})();
const TEXT_BYTES = Buffer.from('esto no es un archivo medico, es texto plano.\n'.repeat(4));

function fakeFile(originalname: string, buffer: Buffer): UploadedFilePayload {
  return { originalname, buffer };
}

let testModule: TestingModule;
const createdPatientIds: string[] = [];

async function adminActor(): Promise<{ id: string; ip: string }> {
  const prisma = testModule.get(PrismaService);
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local';
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  return { id: admin.id, ip: '127.0.0.1' };
}

/** Crea un paciente de prueba (con sus 52 dientes) vía PatientsService. */
async function createTestPatient(offset: number): Promise<string> {
  const patientsService = testModule.get(PatientsService);
  const actor = await adminActor();
  const patient = await patientsService.create(
    {
      firstName: 'Archivos',
      lastName: `Fase7${offset}`,
      dni: String((Date.now() % 9_000_000) + 1_000_000 + offset),
    },
    actor,
  );
  createdPatientIds.push(patient.id);
  return patient.id;
}

async function readStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe('FilesService (fase 7 — archivos médicos)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL no está definida (revisá .env en la raíz).');
    }
    const { AppModule } = await import('../app.module');
    testModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await testModule.init();
  });

  afterAll(async () => {
    const prisma = testModule.get(PrismaService);
    const storage = testModule.get<StorageProvider>(STORAGE_PROVIDER);
    // Limpieza robusta por paciente (no por ids trackeados).
    const files = await prisma.medicalFile.findMany({
      where: { patientId: { in: createdPatientIds } },
      select: { id: true, storageKey: true },
    });
    const fileIds = files.map((file) => file.id);
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityType: 'MEDICAL_FILE', entityId: { in: fileIds } },
          { entityType: 'PATIENT', entityId: { in: createdPatientIds } },
        ],
      },
    });
    await prisma.medicalFile.deleteMany({ where: { id: { in: fileIds } } });
    await prisma.tooth.deleteMany({ where: { patientId: { in: createdPatientIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
    for (const file of files) {
      await storage.delete(file.storageKey);
    }
    await testModule.close();
  });

  it('sube un archivo: nombre saneado, clave del servidor, blob persistido y auditoría', async () => {
    const service = testModule.get(FilesService);
    const prisma = testModule.get(PrismaService);
    const actor = await adminActor();
    const patientId = await createTestPatient(400);

    const created = await service.uploadToPatient(
      patientId,
      fakeFile('../carpeta/radio final (copia).PNG', PNG_BYTES),
      { kind: 'RADIOGRAFIA', description: 'Panorámica de control' },
      actor,
    );

    // Nombre base sin rutas; la clave es generada y guardada SOLO por el
    // servidor (se verifica en BD: la respuesta HTTP jamás la expone).
    expect(created.originalName).toBe('radio final (copia).PNG');
    expect(created.name).toBe('radio final (copia).PNG');
    expect(created).not.toHaveProperty('storageKey');
    const dbRow = await prisma.medicalFile.findUnique({
      where: { id: created.id },
      select: { storageKey: true },
    });
    expect(dbRow?.storageKey.startsWith(`patients/${patientId}/`)).toBe(true);
    expect(dbRow?.storageKey.endsWith('.png')).toBe(true);
    expect(created.mimeType).toBe('image/png');
    expect(created.size).toBe(PNG_BYTES.length);
    expect(created.description).toBe('Panorámica de control');
    expect(created.toothId).toBeNull();
    expect(created.archivedAt).toBeNull();
    expect(created.uploadedBy.id).toBe(actor.id);

    // El blob existe en el almacenamiento con los bytes originales.
    const storage = testModule.get<StorageProvider>(STORAGE_PROVIDER);
    const stored = await readStream(await storage.getStream(dbRow?.storageKey ?? ''));
    expect(Buffer.compare(stored, PNG_BYTES)).toBe(0);

    // Auditoría FILE_UPLOADED sin texto libre del usuario.
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'FILE_UPLOADED', entityId: created.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.entityType).toBe('MEDICAL_FILE');
    const metadata = audit?.metadata as Record<string, unknown> | null;
    expect(metadata?.patientId).toBe(patientId);
    expect(metadata?.kind).toBe('RADIOGRAFIA');
    expect(metadata?.mimeType).toBe('image/png');
    expect(metadata?.description).toBeUndefined();
    expect(metadata?.name).toBeUndefined();
  });

  it('acepta los formatos de la whitelist y vacía description a null', async () => {
    const service = testModule.get(FilesService);
    const actor = await adminActor();
    const patientId = await createTestPatient(401);

    const jpeg = await service.uploadToPatient(
      patientId,
      fakeFile('foto.jpg', JPEG_BYTES),
      { kind: 'FOTOGRAFIA', description: '' },
      actor,
    );
    expect(jpeg.mimeType).toBe('image/jpeg');
    expect(jpeg.description).toBeNull();

    const pdf = await service.uploadToPatient(
      patientId,
      fakeFile('estudio.pdf', PDF_BYTES),
      {
        kind: 'PDF',
      },
      actor,
    );
    expect(pdf.mimeType).toBe('application/pdf');

    const dcm = await service.uploadToPatient(
      patientId,
      fakeFile('placa.dcm', DICOM_BYTES),
      {
        kind: 'RADIOGRAFIA',
      },
      actor,
    );
    expect(dcm.mimeType).toBe('application/dicom');
  });

  it('asocia el archivo a un diente (nivel paciente y CU-10 a nivel diente)', async () => {
    const service = testModule.get(FilesService);
    const prisma = testModule.get(PrismaService);
    const actor = await adminActor();
    const patientId = await createTestPatient(402);
    const tooth = await prisma.tooth.findUniqueOrThrow({
      where: { patientId_fdiNumber: { patientId, fdiNumber: 16 } },
      select: { id: true },
    });

    // Nivel paciente con toothId en los campos del multipart.
    const withTooth = await service.uploadToPatient(
      patientId,
      fakeFile('diente16.png', PNG_BYTES),
      { kind: 'IMAGEN', toothId: tooth.id },
      actor,
    );
    expect(withTooth.toothId).toBe(tooth.id);
    expect(withTooth.patientId).toBe(patientId);

    // CU-10: subida directa al diente hereda el paciente.
    const toTooth = await service.uploadToTooth(
      tooth.id,
      fakeFile('diente16b.png', PNG_BYTES),
      { kind: 'RADIOGRAFIA' },
      actor,
    );
    expect(toTooth.toothId).toBe(tooth.id);
    expect(toTooth.patientId).toBe(patientId);
  });

  it('rechaza sin archivo, extensión fuera de whitelist, contenido inválido o mal emparejado y tamaño', async () => {
    const service = testModule.get(FilesService);
    const actor = await adminActor();
    const patientId = await createTestPatient(403);

    // Sin archivo / buffer vacío.
    await expectApiError(
      service.uploadToPatient(patientId, undefined, { kind: 'PDF' }, actor),
      'FILE_REQUIRED',
    );
    await expectApiError(
      service.uploadToPatient(
        patientId,
        fakeFile('vacio.png', Buffer.alloc(0)),
        {
          kind: 'IMAGEN',
        },
        actor,
      ),
      'FILE_REQUIRED',
    );

    // Extensión fuera de la whitelist (aunque el contenido sea PNG válido).
    await expectApiError(
      service.uploadToPatient(
        patientId,
        fakeFile('instalador.exe', PNG_BYTES),
        {
          kind: 'IMAGEN',
        },
        actor,
      ),
      'FILE_EXTENSION_NOT_ALLOWED',
    );

    // Magic bytes irreconocibles (texto haciéndose pasar por imagen).
    await expectApiError(
      service.uploadToPatient(
        patientId,
        fakeFile('estudio.pdf', TEXT_BYTES),
        { kind: 'PDF' },
        actor,
      ),
      'FILE_CONTENT_INVALID',
    );

    // Contenido real no coincide con la extensión (PNG declarado como .jpg).
    await expectApiError(
      service.uploadToPatient(
        patientId,
        fakeFile('radiografia.jpg', PNG_BYTES),
        {
          kind: 'RADIOGRAFIA',
        },
        actor,
      ),
      'FILE_TYPE_MISMATCH',
    );

    // Tamaño mayor al máximo (defensa además del límite de multer).
    const overLimit = Buffer.concat([PNG_BYTES, Buffer.alloc(25 * 1024 * 1024, 0x41)]);
    await expectApiError(
      service.uploadToPatient(
        patientId,
        fakeFile('gigante.png', overLimit),
        {
          kind: 'IMAGEN',
        },
        actor,
      ),
      'FILE_TOO_LARGE',
    );
  });

  it('devuelve 404 por paciente o diente inexistente o de otro paciente', async () => {
    const service = testModule.get(FilesService);
    const prisma = testModule.get(PrismaService);
    const actor = await adminActor();
    const patientA = await createTestPatient(404);
    const patientB = await createTestPatient(405);
    const toothB = await prisma.tooth.findUniqueOrThrow({
      where: { patientId_fdiNumber: { patientId: patientB, fdiNumber: 26 } },
      select: { id: true },
    });

    await expectApiError(
      service.uploadToPatient(
        'a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10',
        fakeFile('x.png', PNG_BYTES),
        {
          kind: 'IMAGEN',
        },
        actor,
      ),
      'PATIENT_NOT_FOUND',
    );
    await expectApiError(
      service.listPatientFiles('a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10'),
      'PATIENT_NOT_FOUND',
    );

    // El diente de B no se asocia al paciente A (ni siquiera filtrando que existe).
    await expectApiError(
      service.uploadToPatient(
        patientA,
        fakeFile('ajeno.png', PNG_BYTES),
        {
          kind: 'IMAGEN',
          toothId: toothB.id,
        },
        actor,
      ),
      'TOOTH_NOT_FOUND',
    );
    await expectApiError(
      service.uploadToTooth(
        'a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10',
        fakeFile('x.png', PNG_BYTES),
        {
          kind: 'IMAGEN',
        },
        actor,
      ),
      'TOOTH_NOT_FOUND',
    );
  });

  it('lista los archivos activos del paciente (sin archivados) con subidor', async () => {
    const service = testModule.get(FilesService);
    const actor = await adminActor();
    const patientId = await createTestPatient(406);

    const first = await service.uploadToPatient(
      patientId,
      fakeFile('a.png', PNG_BYTES),
      {
        kind: 'IMAGEN',
      },
      actor,
    );
    const second = await service.uploadToPatient(
      patientId,
      fakeFile('b.png', PNG_BYTES),
      {
        kind: 'IMAGEN',
      },
      actor,
    );

    const active = await service.listPatientFiles(patientId);
    expect(active.map((file) => file.id).sort()).toEqual([first.id, second.id].sort());
    expect(active[0]?.uploadedBy.lastName).toBeTruthy();

    // Tras archivar uno, sale de la lista; los archivos ajenos no aparecen.
    await service.archiveFile(first.id, actor);
    const afterArchive = await service.listPatientFiles(patientId);
    expect(afterArchive.map((file) => file.id)).toEqual([second.id]);

    const otherPatient = await createTestPatient(407);
    const otherFiles = await service.listPatientFiles(otherPatient);
    expect(otherFiles).toHaveLength(0);
  });

  it('sirve el contenido por el proxy con auditoría FILE_DOWNLOADED', async () => {
    const service = testModule.get(FilesService);
    const prisma = testModule.get(PrismaService);
    const actor = await adminActor();
    const patientId = await createTestPatient(408);
    const uploaded = await service.uploadToPatient(
      patientId,
      fakeFile('descarga.png', PNG_BYTES),
      {
        kind: 'IMAGEN',
      },
      actor,
    );

    const { file, stream } = await service.openFile(uploaded.id, actor);
    expect(file.id).toBe(uploaded.id);
    const bytes = await readStream(stream);
    expect(Buffer.compare(bytes, PNG_BYTES)).toBe(0);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'FILE_DOWNLOADED', entityId: uploaded.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.userId).toBe(actor.id);

    await expectApiError(
      service.openFile('a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10', actor),
      'FILE_NOT_FOUND',
    );
    await expectApiError(service.getFile('a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10'), 'FILE_NOT_FOUND');
  });

  it('archiva sin borrado físico: doble archivado 409 y el blob sigue disponible', async () => {
    const service = testModule.get(FilesService);
    const prisma = testModule.get(PrismaService);
    const actor = await adminActor();
    const patientId = await createTestPatient(409);
    const uploaded = await service.uploadToPatient(
      patientId,
      fakeFile('borrar-no.png', PNG_BYTES),
      {
        kind: 'IMAGEN',
      },
      actor,
    );

    const archived = await service.archiveFile(uploaded.id, actor);
    expect(archived.archivedAt).not.toBeNull();

    await expectApiError(service.archiveFile(uploaded.id, actor), 'FILE_ARCHIVED');
    await expectApiError(
      service.archiveFile('a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10', actor),
      'FILE_NOT_FOUND',
    );

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'FILE_ARCHIVED', entityId: uploaded.id },
    });
    expect(audit).not.toBeNull();

    // El registro y el blob persisten (archivado = lógico, nunca físico).
    const persisted = await prisma.medicalFile.findUnique({ where: { id: uploaded.id } });
    expect(persisted?.archivedAt).not.toBeNull();
    const { stream } = await service.openFile(uploaded.id, actor);
    const bytes = await readStream(stream);
    expect(Buffer.compare(bytes, PNG_BYTES)).toBe(0);
  });
});
