import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Vitest con transformación SWC: necesario para decoradores y
 * emitDecoratorMetadata (DI de NestJS), que esbuild no soporta.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    globals: true,
    // Un archivo a la vez: cada spec crea su AppModule con su propio pool de
    // Prisma; en paralelo agotaban las conexiones de PostgreSQL local (hooks
    // colgados y PrismaClientKnownRequestError en sessions.create).
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
      module: { type: 'es6' },
    }),
  ],
});
