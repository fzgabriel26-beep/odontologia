import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Carga el .env del monorepo antes de que se evalúen los decoradores
 * (límites de rate limit, TTL de sesión, etc.).
 * dotenv no pisa variables ya definidas.
 */
function loadEnv(): void {
  const candidates = ['../../.env', '../.env', '.env'];
  const envPath = candidates.map((c) => resolve(process.cwd(), c)).find((c) => existsSync(c));
  if (envPath) {
    config({ path: envPath });
  }
}

loadEnv();
