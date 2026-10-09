import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { IncomingMessage } from 'node:http';
import request from 'supertest';
import { maxUploadBytes } from '../common/utils/upload-limit';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage-provider';

/**
 * Tests HTTP de archivos médicos (SDD, fase 7): 401 sin sesión; personal con
 * `files.read`/`files.write` sube/lista/descarga/archiva; 403 sin permisos;
 * validación de campos, extensión, magic bytes y tamaño; proxy de descarga con
 * headers de endurecimiento; auditoría FILE_UPLOADED / FILE_DOWNLOADED.
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(128, 3),
]);
const TEXT_BYTES = Buffer.from('soy un archivo de texto disfrazado de estudio.\n'.repeat(4));

/** Parser binario: superagent solo bufferea JSON/texto por defecto. */
function binaryParser(
  res: IncomingMessage,
  callback: (err: Error | null, body?: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Archivos médicos (HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageProvider;
  let adminCookie: string;
  let staffCookie: string;
  let noPermCookie: string;
  let noPermRoleId: string;
  let patientId: string;
  let tooth16Id: string;
  const createdUserIds: string[] = [];
  const createdPatientIds: string[] = [];

  beforeAll(async () => {
    const { AppModule } = await import('../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    storage = moduleRef.get<StorageProvider>(STORAGE_PROVIDER);

    const argon2 = (await import('argon2')).default;
    const passwordHash = await argon2.hash('Consult10', { type: argon2.argon2id });

    // Personal con permisos de archivos (rol ODONTOLOGO).
    const odontologoRole = await prisma.role.findUniqueOrThrow({ where: { key: 'ODONTOLOGO' } });
    const staff = await prisma.user.create({
      data: {
        email: `staff-files-${Date.now()}@example.com`,
        passwordHash,
        firstName: 'Staff',
        lastName: 'Archivos',
        dni: `6${Date.now().toString().slice(-7)}`,
        status: 'ACTIVO',
        roleId: odontologoRole.id,
      },
    });
    createdUserIds.push(staff.id);

    // Rol de prueba sin permisos (no existe en el seed) → debe recibir 403.
    const emptyRole = await prisma.role.create({
      data: {
        key: `SIN_PERM_FILES_${Date.now()}`,
        name: 'Sin permisos de archivos (test)',
        permissions: [],
      },
    });
    noPermRoleId = emptyRole.id;
    const noPermUser = await prisma.user.create({
      data: {
        email: `noperm-files-${Date.now()}@example.com`,
        passwordHash,
        firstName: 'Sin',
        lastName: 'PermisosArchivos',
        dni: `5${Date.now().toString().slice(-7)}`,
        status: 'ACTIVO',
        roleId: emptyRole.id,
      },
    });
    createdUserIds.push(noPermUser.id);

    // Paciente de prueba vía PatientsService (crea los 52 dientes).
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local' },
    });
    const patientsService = moduleRef.get(PatientsService);
    const patient = await patientsService.create(
      {
        firstName: 'Archivos',
        lastName: 'HTTP',
        dni: String((Date.now() % 9_000_000) + 1_000_000 + 500),
      },
      { id: admin.id, ip: '127.0.0.1' },
    );
    patientId = patient.id;
    createdPatientIds.push(patient.id);
    tooth16Id = (
      await prisma.tooth.findUniqueOrThrow({
        where: { patientId_fdiNumber: { patientId, fdiNumber: 16 } },
        select: { id: true },
      })
    ).id;

    adminCookie = await login(
      process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local',
      process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!',
    );
    staffCookie = await login(staff.email, 'Consult10');
    noPermCookie = await login(noPermUser.email, 'Consult10');
  });

  afterAll(async () => {
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
          { userId: { in: createdUserIds } },
        ],
      },
    });
    await prisma.medicalFile.deleteMany({ where: { id: { in: fileIds } } });
    await prisma.tooth.deleteMany({ where: { patientId: { in: createdPatientIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.role.deleteMany({ where: { id: noPermRoleId } });
    for (const file of files) {
      await storage.delete(file.storageKey);
    }
    await app?.close();
  });

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    expect(response.status).toBe(200);
    return (response.headers['set-cookie'][0] as string).split(';')[0];
  }

  function upload(
    buffer: Buffer,
    filename: string,
    fields: Record<string, string> = { kind: 'IMAGEN' },
    cookie: string = staffCookie,
    target: string = `/patients/${patientId}/files`,
  ): ReturnType<typeof request> {
    let req = request(app.getHttpServer()).post(target).set('Cookie', cookie);
    for (const [key, value] of Object.entries(fields)) {
      req = req.field(key, value);
    }
    return req.attach('file', buffer, { filename });
  }

  it('rechaza con 401 los endpoints sin sesión', async () => {
    const list = await request(app.getHttpServer()).get(`/patients/${patientId}/files`);
    expect(list.status).toBe(401);
    expect(list.body.error.code).toBe('UNAUTHORIZED');

    const up = await upload(PNG_BYTES, 'x.png', { kind: 'IMAGEN' }, '');
    expect(up.status).toBe(401);

    const content = await request(app.getHttpServer()).get(
      '/files/a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10/content',
    );
    expect(content.status).toBe(401);
  });

  it('permite al personal subir, listar y consultar metadatos', async () => {
    const created = await upload(PNG_BYTES, 'panoramica.png', {
      kind: 'RADIOGRAFIA',
      description: 'Panorámica inicial',
    });
    expect(created.status).toBe(201);
    expect(created.body.mimeType).toBe('image/png');
    expect(created.body.size).toBe(PNG_BYTES.length);
    expect(created.body.kind).toBe('RADIOGRAFIA');
    expect(created.body.originalName).toBe('panoramica.png');
    // La clave de almacenamiento es interna: jamás sale en la respuesta.
    expect(created.body).not.toHaveProperty('storageKey');
    expect(created.body.uploadedBy.lastName).toBe('Archivos');
    expect(created.body.archivedAt).toBeNull();

    const list = await request(app.getHttpServer())
      .get(`/patients/${patientId}/files`)
      .set('Cookie', staffCookie);
    expect(list.status).toBe(200);
    const ids = (list.body as Array<{ id: string }>).map((file) => file.id);
    expect(ids).toContain(created.body.id);

    const single = await request(app.getHttpServer())
      .get(`/files/${created.body.id}`)
      .set('Cookie', staffCookie);
    expect(single.status).toBe(200);
    expect(single.body.id).toBe(created.body.id);
  });

  it('sirve el contenido por proxy: bytes exactos, headers y disposition', async () => {
    const created = await upload(PNG_BYTES, 'descarga.png', { kind: 'IMAGEN' });
    expect(created.status).toBe(201);

    const inline = await request(app.getHttpServer())
      .get(`/files/${created.body.id}/content`)
      .set('Cookie', adminCookie)
      .parse(binaryParser);
    expect(inline.status).toBe(200);
    expect(inline.headers['content-type']).toBe('image/png');
    expect(inline.headers['content-disposition']).toContain('inline');
    expect(inline.headers['content-disposition']).toContain('filename=');
    expect(inline.headers['x-content-type-options']).toBe('nosniff');
    expect(inline.headers['cache-control']).toContain('no-store');
    expect(Buffer.compare(inline.body as Buffer, PNG_BYTES)).toBe(0);

    const attachment = await request(app.getHttpServer())
      .get(`/files/${created.body.id}/content?disposition=attachment`)
      .set('Cookie', adminCookie)
      .parse(binaryParser);
    expect(attachment.status).toBe(200);
    expect(attachment.headers['content-disposition']).toContain('attachment');
    expect(Buffer.compare(attachment.body as Buffer, PNG_BYTES)).toBe(0);
  });

  it('asocia archivos a dientes (ruta /teeth y campo toothId del multipart)', async () => {
    const viaTooth = await upload(
      PNG_BYTES,
      'diente.png',
      { kind: 'RADIOGRAFIA' },
      staffCookie,
      `/teeth/${tooth16Id}/files`,
    );
    expect(viaTooth.status).toBe(201);
    expect(viaTooth.body.toothId).toBe(tooth16Id);
    expect(viaTooth.body.patientId).toBe(patientId);

    const viaPatient = await upload(PNG_BYTES, 'sin-diente.png', { kind: 'IMAGEN', toothId: '' });
    expect(viaPatient.status).toBe(201);
    expect(viaPatient.body.toothId).toBeNull();
  });

  it('valida campos del multipart, extensión, magic bytes y tamaño', async () => {
    const noKind = await upload(PNG_BYTES, 'x.png', {});
    expect(noKind.status).toBe(400);
    expect(noKind.body.error.code).toBe('VALIDATION_ERROR');
    expect(noKind.body.error.fields.kind).toBeTruthy();

    const badKind = await upload(PNG_BYTES, 'x.png', { kind: 'VIDEO' });
    expect(badKind.status).toBe(400);
    expect(badKind.body.error.fields.kind).toBe('Elegí un tipo de archivo válido.');

    const noFileResp = await request(app.getHttpServer())
      .post(`/patients/${patientId}/files`)
      .set('Cookie', staffCookie)
      .field('kind', 'IMAGEN');
    expect(noFileResp.status).toBe(400);
    expect(noFileResp.body.error.code).toBe('FILE_REQUIRED');

    const badExt = await upload(PNG_BYTES, 'instalador.exe');
    expect(badExt.status).toBe(400);
    expect(badExt.body.error.code).toBe('FILE_EXTENSION_NOT_ALLOWED');

    const spoofed = await upload(TEXT_BYTES, 'estudio.pdf', { kind: 'PDF' });
    expect(spoofed.status).toBe(400);
    expect(spoofed.body.error.code).toBe('FILE_CONTENT_INVALID');

    const mismatch = await upload(PNG_BYTES, 'radiografia.jpg', { kind: 'RADIOGRAFIA' });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe('FILE_TYPE_MISMATCH');

    const badUuid = await upload(
      PNG_BYTES,
      'x.png',
      { kind: 'IMAGEN' },
      staffCookie,
      '/patients/no-es-uuid/files',
    );
    expect(badUuid.status).toBe(400);
    expect(badUuid.body.error.code).toBe('INVALID_ID');

    const missingPatient = await request(app.getHttpServer())
      .get('/patients/a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10/files')
      .set('Cookie', staffCookie);
    expect(missingPatient.status).toBe(404);
    expect(missingPatient.body.error.code).toBe('PATIENT_NOT_FOUND');

    const missingFile = await request(app.getHttpServer())
      .get('/files/a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10')
      .set('Cookie', staffCookie);
    expect(missingFile.status).toBe(404);
    expect(missingFile.body.error.code).toBe('FILE_NOT_FOUND');
  });

  it('rechaza con 413 archivos que superan MAX_UPLOAD_MB (límite de multer)', async () => {
    // Nest convierte LIMIT_FILE_SIZE en 413; el filtro lo traduce a un
    // mensaje en español con el código FILE_TOO_LARGE.
    const overLimit = Buffer.concat([PNG_BYTES, Buffer.alloc(maxUploadBytes() + 1, 0x41)]);
    const resp = await upload(overLimit, 'gigante.png');
    expect(resp.status).toBe(413);
    expect(resp.body.error.code).toBe('FILE_TOO_LARGE');
    expect(resp.body.error.message).toContain('máximo permitido');
  });

  it('rechaza con 403 al usuario sin permisos de archivos', async () => {
    const list = await request(app.getHttpServer())
      .get(`/patients/${patientId}/files`)
      .set('Cookie', noPermCookie);
    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('FORBIDDEN');

    const up = await upload(PNG_BYTES, 'x.png', { kind: 'IMAGEN' }, noPermCookie);
    expect(up.status).toBe(403);

    const arch = await request(app.getHttpServer())
      .post('/files/a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10/archive')
      .set('Cookie', noPermCookie);
    expect(arch.status).toBe(403);
  });

  it('archiva: sale de la lista, doble archivado 409 y auditoría de subida/descarga', async () => {
    const created = await upload(PNG_BYTES, 'luego-archivado.png', { kind: 'ESTUDIO' });
    expect(created.status).toBe(201);

    // Descarga previa para dejar FILE_DOWNLOADED en auditoría.
    const download = await request(app.getHttpServer())
      .get(`/files/${created.body.id}/content`)
      .set('Cookie', adminCookie)
      .parse(binaryParser);
    expect(download.status).toBe(200);

    const archived = await request(app.getHttpServer())
      .post(`/files/${created.body.id}/archive`)
      .set('Cookie', staffCookie);
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).not.toBeNull();

    const list = await request(app.getHttpServer())
      .get(`/patients/${patientId}/files`)
      .set('Cookie', staffCookie);
    const ids = (list.body as Array<{ id: string }>).map((file) => file.id);
    expect(ids).not.toContain(created.body.id);

    // Metadatos directos siguen accesibles (decisión de fase 7).
    const single = await request(app.getHttpServer())
      .get(`/files/${created.body.id}`)
      .set('Cookie', staffCookie);
    expect(single.status).toBe(200);

    const twice = await request(app.getHttpServer())
      .post(`/files/${created.body.id}/archive`)
      .set('Cookie', staffCookie);
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('FILE_ARCHIVED');

    const unknown = await request(app.getHttpServer())
      .post('/files/a3f1c9d2-1b4e-4f6a-8c9d-0e2f4a6b8c10/archive')
      .set('Cookie', staffCookie);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('FILE_NOT_FOUND');

    // Auditoría en BD: subida + descarga + archivado (sin texto clínico).
    const actions = await prisma.auditLog.findMany({
      where: { entityId: created.body.id },
      select: { action: true },
    });
    const joined = actions.map((row) => row.action).join(',');
    expect(joined).toContain('FILE_UPLOADED');
    expect(joined).toContain('FILE_DOWNLOADED');
    expect(joined).toContain('FILE_ARCHIVED');
  });
});
