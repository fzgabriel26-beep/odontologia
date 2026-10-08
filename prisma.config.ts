import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Configuración de Prisma CLI (Prisma 7).
 * La URL de la base de datos sale de .env (nunca versionado).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
