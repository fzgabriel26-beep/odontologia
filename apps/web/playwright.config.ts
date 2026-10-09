import { defineConfig, devices } from '@playwright/test';

/**
 * E2E del web (fase 12, SDD §13).
 *
 * - `webServer` levanta API (3001) y web (3000) solo si no están corriendo:
 *   reutiliza los dev servers locales si ya viven (patrón de fase 11).
 * - Secuencial (workers: 1) porque todos los specs comparten la misma BD.
 * - Setup de sesión: `e2e/auth.setup.ts` loguea UNA vez y guarda el estado en
 *   `.auth/admin.json`; el resto de specs lo reutiliza (evita gastar el rate
 *   limit de login: 10/min).
 * - E2E_PROD_URL (opcional): si está definida, corre además el smoke del
 *   deploy público (headers/CSP de Render) — ver e2e/prod-smoke.spec.ts.
 */
const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      // Sesión reutilizada por todas las specs (login solo en el setup).
      use: { ...devices['Desktop Chrome'], storageState: '.auth/admin.json' },
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @odonto/api dev',
      url: `${API_URL}/api/v1/health`,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @odonto/web dev',
      url: WEB_URL,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
