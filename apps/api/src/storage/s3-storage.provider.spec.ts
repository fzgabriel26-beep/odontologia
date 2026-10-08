import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { createStorageProvider } from './storage.module';
import { S3StorageProvider } from './s3-storage.provider';

/**
 * Tests unitarios del proveedor S3 (ADR-003): comprueba los comandos enviados
 * al SDK con `send` espiado (sin red) y el manejo de "objeto inexistente".
 */
describe('S3StorageProvider', () => {
  function makeClient(): { client: S3Client; send: ReturnType<typeof vi.spyOn> } {
    const client = new S3Client({
      region: 'us-east-1',
      credentials: { accessKeyId: 'k', secretAccessKey: 's' },
    });
    const send = vi.spyOn(client, 'send').mockImplementation(async () => ({}));
    return { client, send };
  }

  it('put envía PutObjectCommand con bucket, clave, cuerpo y content type', async () => {
    const { client, send } = makeClient();
    const provider = new S3StorageProvider(client, 'bucket-test');
    const data = Buffer.from('contenido');

    await provider.put('patients/a/b.pdf', data, 'application/pdf');

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.Bucket).toBe('bucket-test');
    expect(command.input.Key).toBe('patients/a/b.pdf');
    expect(command.input.ContentType).toBe('application/pdf');
    expect(Buffer.from(command.input.Body as Uint8Array).toString()).toBe('contenido');
  });

  it('getStream devuelve el stream del cuerpo con los bytes originales', async () => {
    const { client, send } = makeClient();
    const provider = new S3StorageProvider(client, 'bucket-test');
    send.mockImplementation(async () => ({
      Body: Readable.from([Buffer.from('bytes-del-objeto')]),
    }));

    const stream = await provider.getStream('patients/a/b.pdf');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));

    const command = send.mock.calls[0]?.[0] as GetObjectCommand;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input.Key).toBe('patients/a/b.pdf');
    expect(Buffer.concat(chunks).toString()).toBe('bytes-del-objeto');
  });

  it('getStream traduce "no existe" (NoSuchKey/404) a FILE_STORAGE_MISSING', async () => {
    const { client, send } = makeClient();
    const provider = new S3StorageProvider(client, 'bucket-test');
    const missing = Object.assign(new Error('missing'), {
      name: 'NoSuchKey',
      $metadata: { httpStatusCode: 404 },
    });
    send.mockImplementation(async () => {
      throw missing;
    });

    await expect(provider.getStream('no/existe')).rejects.toMatchObject({
      response: { error: { code: 'FILE_STORAGE_MISSING' } },
    });
    // Otros errores de S3 no se disfrazan de 404.
    send.mockImplementation(async () => {
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    });
    await expect(provider.getStream('otra')).rejects.toThrow('timeout');
    // NotFound sin cuerpo también cae en FILE_STORAGE_MISSING.
    send.mockImplementation(async () => ({ Body: undefined }));
    await expect(provider.getStream('sin-cuerpo')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delete envía DeleteObjectCommand (idempotente)', async () => {
    const { client, send } = makeClient();
    const provider = new S3StorageProvider(client, 'bucket-test');

    await provider.delete('patients/a/b.pdf');

    const command = send.mock.calls[0]?.[0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input.Bucket).toBe('bucket-test');
    expect(command.input.Key).toBe('patients/a/b.pdf');
  });
});

describe('createStorageProvider', () => {
  it('usa FS por defecto y carpeta configurable', () => {
    const provider = createStorageProvider({ STORAGE_FS_DIR: 'mis-archivos' } as NodeJS.ProcessEnv);
    expect(provider.constructor.name).toBe('FsStorageProvider');
  });

  it('con STORAGE_DRIVER=s3 construye el proveedor S3', () => {
    const provider = createStorageProvider({
      STORAGE_DRIVER: 's3',
      STORAGE_BUCKET: 'bucket-test',
      STORAGE_ACCESS_KEY_ID: 'k',
      STORAGE_SECRET_ACCESS_KEY: 's',
    } as NodeJS.ProcessEnv);
    expect(provider.constructor.name).toBe('S3StorageProvider');
  });

  it('rechaza drivers desconocidos y s3 sin bucket', () => {
    expect(() => createStorageProvider({ STORAGE_DRIVER: 'ftp' } as NodeJS.ProcessEnv)).toThrow(
      "STORAGE_DRIVER inválido: 'ftp'",
    );
    expect(() => createStorageProvider({ STORAGE_DRIVER: 's3' } as NodeJS.ProcessEnv)).toThrow(
      'STORAGE_BUCKET',
    );
  });
});
