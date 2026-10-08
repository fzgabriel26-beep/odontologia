import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

/**
 * Protección contra fuerza bruta (SDD, fase 2):
 * el rate limit de /auth/* corta tras RATE_LIMIT_MAX intentos por ventana.
 * El límite se baja a 3 para que el test sea rápido.
 */
vi.hoisted(() => {
  process.env.RATE_LIMIT_MAX = '3';
});

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

describe('Rate limiting en login (fuerza bruta)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = await import('../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.RATE_LIMIT_MAX;
  });

  it('devuelve 429 con mensaje en español tras superar el límite de intentos', async () => {
    const email = `fuerza-bruta-${Date.now()}@example.com`;
    const attempt = () =>
      request(app.getHttpServer()).post('/auth/login').send({ email, password: 'PasswordMala1' });

    // Los primeros intentos fallan con401 (credenciales inválidas).
    for (let i = 0; i < 3; i++) {
      const response = await attempt();
      expect(response.status).toBe(401);
    }

    // El cuarto intento queda bloqueado por el throttler.
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.message).toMatch(/Demasiados intentos/);
  });
});
