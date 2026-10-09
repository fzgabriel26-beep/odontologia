#!/usr/bin/env node
/**
 * Backup lógico de PostgreSQL con pg_dump (fase 12, SDD §7).
 *
 * Uso:
 *   BACKUP_DATABASE_URL='postgresql://...?sslmode=require' node scripts/backup-db.mjs
 *
 * Variables:
 *   BACKUP_DATABASE_URL    Obligatoria. URL de conexión. NUNCA se imprime
 *                          en logs (pg_dump no la repite en errores normales).
 *   BACKUP_DIR             Carpeta de salida (default: ./backups).
 *   BACKUP_RETENTION_DAYS  Borra dumps locales con más de N días (default 30).
 *                          En CI la retención de los artefactos la gobierna
 *                          upload-artifact vía la repo variable
 *                          BACKUP_RETENTION_DAYS (ver backup.yml).
 *
 * Requiere pg_dump en el PATH (en CI se instala con apt; local, ver
 * docs/OPERACIONES.md). El dump es formato custom (-Fc) y se restaura con
 * pg_restore. El usuario automático es quien ejecuta este script.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

function fail(message) {
  console.error(`[backup-db] ERROR: ${message}`);
  process.exit(1);
}

const url = process.env.BACKUP_DATABASE_URL;
if (!url) {
  fail(
    'falta BACKUP_DATABASE_URL (con ?sslmode=require para Render). ' +
      'Ver docs/OPERACIONES.md § "Backups".',
  );
}

const dir = resolve(process.env.BACKUP_DIR ?? 'backups');
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? '30');
if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
  fail('BACKUP_RETENTION_DAYS debe ser un número mayor a 0.');
}

mkdirSync(dir, { recursive: true });

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(
  now.getHours(),
)}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const file = join(dir, `odontologia_${stamp}.dump`);

process.stdout.write(`[backup-db] Destino: ${file}\n`);
process.stdout.write(`[backup-db] Retención local: ${retentionDays} días\n`);

const result = spawnSync(
  'pg_dump',
  ['--format=custom', `--file=${file}`, `--dbname=${url}`],
  { stdio: ['ignore', 'inherit', 'inherit'] },
);

if (result.error?.code === 'ENOENT') {
  fail(
    'pg_dump no está en el PATH. Instalá el cliente de PostgreSQL ' +
      '(CI: apt-get install postgresql-client) o seguí docs/OPERACIONES.md.',
  );
}
if (result.status !== 0) {
  fail(`pg_dump terminó con código ${result.status}.`);
}
if (!existsSync(file) || statSync(file).size === 0) {
  fail('el dump no se creó o quedó vacío.');
}

// Retención local: elimina dumps propios vencidos (patrón estricto propio).
const ownDump = /^odontologia_\d{4}-\d{2}-\d{2}_\d{6}\.dump$/;
const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
let pruned = 0;
for (const name of readdirSync(dir)) {
  if (!ownDump.test(name)) continue;
  const path = join(dir, name);
  if (statSync(path).mtimeMs < cutoff) {
    unlinkSync(path);
    pruned += 1;
  }
}

const sizeMb = (statSync(file).size / (1024 * 1024)).toFixed(2);
process.stdout.write(`[backup-db] OK: ${file} (${sizeMb} MB)\n`);
process.stdout.write(`[backup-db] Dumps locales eliminados por retención: ${pruned}\n`);
