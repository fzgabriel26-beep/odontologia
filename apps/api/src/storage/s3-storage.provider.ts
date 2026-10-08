import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NotFoundException } from '@nestjs/common';
import type { Readable } from 'node:stream';
import type { StorageProvider } from './storage-provider';

function storageMissing(): NotFoundException {
  return new NotFoundException({
    error: {
      code: 'FILE_STORAGE_MISSING',
      message: 'El archivo no está disponible en el almacenamiento.',
    },
  });
}

/** ¿El error de S3 significa "no existe"? (NoSuchKey / NotFound / 404). */
function isS3Missing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  const metadata = (error as { $metadata?: unknown }).$metadata;
  const status =
    typeof metadata === 'object' && metadata !== null
      ? (metadata as { httpStatusCode?: unknown }).httpStatusCode
      : undefined;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

/**
 * Proveedor S3 compatible (ADR-003): MinIO, AWS S3 o Cloudflare R2 según las
 * variables de entorno. El bucket es privado; el acceso siempre pasa por el
 * backend (SDD §4.6).
 */
export class S3StorageProvider implements StorageProvider {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async getStream(key: string): Promise<Readable> {
    let body: unknown;
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      body = result.Body;
    } catch (error) {
      if (isS3Missing(error)) throw storageMissing();
      throw error;
    }
    if (body === undefined || body === null) throw storageMissing();
    return body as Readable;
  }

  async delete(key: string): Promise<void> {
    // S3 responde 204 aunque el objeto no exista (idempotente).
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
