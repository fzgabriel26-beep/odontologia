import '../common/config/env';
import { Global, Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { resolve } from 'node:path';
import { FsStorageProvider } from './fs-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { STORAGE_PROVIDER, type StorageProvider } from './storage-provider';

/**
 * Fábrica del proveedor de almacenamiento (ADR-003):
 *  - `STORAGE_DRIVER=fs` (default): carpeta privada local (`STORAGE_FS_DIR`).
 *  - `STORAGE_DRIVER=s3`: bucket S3 compatible con las vars `STORAGE_*`.
 */
export function createStorageProvider(env: NodeJS.ProcessEnv = process.env): StorageProvider {
  const driver = (env.STORAGE_DRIVER ?? 'fs').toLowerCase();

  if (driver === 'fs') {
    // Absoluta o relativa al cwd del proceso (apps/api); nunca dentro de public/.
    const dir = env.STORAGE_FS_DIR ?? 'storage-files';
    return new FsStorageProvider(resolve(process.cwd(), dir));
  }

  if (driver === 's3') {
    const bucket = env.STORAGE_BUCKET;
    if (!bucket) {
      throw new Error('STORAGE_DRIVER=s3 requiere STORAGE_BUCKET.');
    }
    const accessKeyId = env.STORAGE_ACCESS_KEY_ID;
    const secretAccessKey = env.STORAGE_SECRET_ACCESS_KEY;
    const client = new S3Client({
      region: env.STORAGE_REGION ?? 'us-east-1',
      endpoint: env.STORAGE_ENDPOINT || undefined,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === 'true',
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
    return new S3StorageProvider(client, bucket);
  }

  throw new Error(`STORAGE_DRIVER inválido: '${driver}' (esperado 'fs' o 's3').`);
}

@Global()
@Module({
  providers: [{ provide: STORAGE_PROVIDER, useFactory: createStorageProvider }],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
