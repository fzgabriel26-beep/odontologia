import { NotFoundException } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type { StorageProvider } from './storage-provider';

/**
 * Proveedor FS local (desarrollo y tests): los objetos viven en una carpeta
 * privada fuera de `public/`; solo se sirven por el proxy autenticado
 * `GET /files/:id/content` (SDD §4.6 — bucket sin acceso público).
 */
export class FsStorageProvider implements StorageProvider {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = resolve(baseDir);
  }

  /** Resuelve la clave dentro de la carpeta base (defensa contra path traversal). */
  private resolveKey(key: string): string {
    const full = resolve(this.baseDir, key);
    if (full !== this.baseDir && !full.startsWith(this.baseDir + sep)) {
      throw new Error('Clave de almacenamiento inválida.');
    }
    return full;
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<void> {
    const full = this.resolveKey(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async getStream(key: string): Promise<Readable> {
    const full = this.resolveKey(key);
    try {
      await stat(full);
    } catch {
      throw new NotFoundException({
        error: {
          code: 'FILE_STORAGE_MISSING',
          message: 'El archivo no está disponible en el almacenamiento.',
        },
      });
    }
    return createReadStream(full);
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }
}
