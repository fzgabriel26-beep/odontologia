import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { securityHeaders } from './security-headers';

/**
 * Headers de seguridad globales (fase 12, ADR-017): se aplican igual que en el
 * bootstrap real (`main.ts`) para poder probarlos por HTTP.
 */

const envPath = ['../../../.env', '../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

function expectSecurityHeaders(headers: Record<string, unknown>): void {
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['cache-control']).toBe('no-store');
  // El framework nunca se anuncia.
  expect(headers['x-powered-by']).toBeUndefined();
}

describe('Headers de seguridad (fase 12, ADR-017)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = await import('../../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(securityHeaders);
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('los expone en respuestas exitosas (GET /health)', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');
    expect(response.status).toBe(200);
    expectSecurityHeaders(response.headers);
  });

  it('los expone también en errores (404 de ruta inexistente)', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/no-existe');
    expect(response.status).toBe(404);
    expectSecurityHeaders(response.headers);
  });
});
