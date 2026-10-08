import { ALLOWED_MIME_TYPES } from '@odonto/types';

/** MIME detectado por contenido (subconjunto de la whitelist del SDD). */
export type SniffedMime = (typeof ALLOWED_MIME_TYPES)[number];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Extensión en minúsculas con punto (o '' si no tiene). */
export function fileExtensionOf(originalName: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot).toLowerCase();
}

/** MIME esperado según la extensión (whitelist) o null si no está permitida. */
export function mimeForExtension(ext: string): SniffedMime | null {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.pdf':
      return 'application/pdf';
    case '.dcm':
      return 'application/dicom';
    default:
      return null;
  }
}

function ascii(buffer: Buffer, start: number, length: number): string {
  return buffer.subarray(start, start + length).toString('latin1');
}

/**
 * Detecta el tipo real del archivo por magic bytes (SDD §10 — MIME real, no el
 * declarado por el cliente). Devuelve null si no coincide con ningún formato
 * permitido.
 */
export function sniffMime(buffer: Buffer): SniffedMime | null {
  // PNG: 8-byte signature.
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  // JPEG: SOI + marker (FF D8 FF).
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // WEBP: "RIFF"...."WEBP".
  if (buffer.length >= 12 && ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 4) === 'WEBP') {
    return 'image/webp';
  }
  // DICOM: "DICM" en el offset 128 (preamble estándar).
  if (buffer.length >= 132 && ascii(buffer, 128, 4) === 'DICM') return 'application/dicom';
  // PDF: cabecera "%PDF" al inicio o dentro de los primeros 1024 bytes (ISO 32000).
  const scanEnd = Math.min(buffer.length - 4, 1024);
  for (let i = 0; i <= scanEnd; i++) {
    if (ascii(buffer, i, 4) === '%PDF') return 'application/pdf';
  }
  return null;
}
