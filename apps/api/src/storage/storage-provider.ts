import type { Readable } from 'node:stream';

/** Token de inyección del proveedor de almacenamiento (SDD §4, fase 7). */
export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

/**
 * Adaptador único de object storage (ADR-003): FS local en desarrollo y S3
 * compatible en producción, seleccionado por `STORAGE_DRIVER`. Las claves las
 * genera siempre el servidor (`storageKey` en la BD); nunca el cliente.
 */
export interface StorageProvider {
  /** Guarda (sobrescribe) el objeto bajo la clave del servidor. */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Lectura como stream; lanza error si la clave no existe. */
  getStream(key: string): Promise<Readable>;
  /** Elimina el objeto (idempotente). */
  delete(key: string): Promise<void>;
}
