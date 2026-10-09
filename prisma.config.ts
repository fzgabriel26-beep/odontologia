import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Configuración de Prisma CLI (Prisma 7).
 * La URL de la base de datos sale de .env (nunca versionado).
 *
 * En el build del Dockerfile (ADR-016) no existe DATABASE_URL: las variables
 * de entorno son de runtime y `prisma generate` no necesita conexión, así que
 * se usa como placeholder el mismo default de .env.example. Si alguien corre
 * un migrate sin DATABASE_URL real, fallará igual al conectar.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://odontologia:odontologia@localhost:5432/odontologia?schema=public',
  },
});
