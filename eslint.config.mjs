import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/.turbo/**',
      // Archivos generados por Next.js
      '**/next-env.d.ts',
      '**/apps/web/out/**',
      // Cliente Prisma generado
      '**/src/generated/**',
      'apps/desktop/src-tauri/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Regla de código del SDD: sin `any` salvo casos justificados.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // Identificadores con prefijo '_' (parámetros de interfaz obligatorios
      // sin uso, p. ej. put(key, data, _contentType)) no cuentan como sin uso.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // NestJS inyecta clases en constructores vía emitDecoratorMetadata:
    // esos imports deben ser valores en runtime, nunca `import type`.
    files: ['apps/api/src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
);
