/**
 * Límite de subida de archivos (SDD §10): `MAX_UPLOAD_MB` del .env
 * (default 25 MB). Se aplica en multer (límite de stream) y se vuelve a
 * validar en el servicio antes de persistir.
 */
export function maxUploadMb(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.MAX_UPLOAD_MB);
  return Number.isFinite(raw) && raw > 0 ? raw : 25;
}

export function maxUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
  return maxUploadMb(env) * 1024 * 1024;
}
