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
