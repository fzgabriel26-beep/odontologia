import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { corsOptions } from '../common/utils/origins';

/**
 * Tests HTTP de autenticación (SDD, fase 2): flujo de cookie httpOnly,
 * guard de sesión, validación de body y control CSRF (ADR-012).
 * Usa la cuenta del seed (admin@consultorio.local).
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

describe('Autenticación HTTP (cookie de sesión)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = await import('../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Mismo CORS que el bootstrap real (main.ts) para poder probarlo por HTTP.
    app.enableCors(corsOptions());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rechaza credenciales inválidas con mensaje genérico en español', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@consultorio.local', password: 'PasswordIncorrecta1' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(response.body.error.message).toBe('Email o contraseña incorrectos.');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('valida el body con Zod antes de tocar la base', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'no-es-un-email', password: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fields.email).toBeTruthy();
    expect(response.body.error.fields.password).toBeTruthy();
  });

  it('hace login, expone /me con la cookie y cierra la sesión con logout', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@consultorio.local',
        password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!',
      });

    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe('admin@consultorio.local');
    expect(login.body.user.permissions.length).toBeGreaterThan(0);

    const cookie = login.headers['set-cookie'][0] as string;
    expect(cookie).toContain('odon_session=');
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
    const sessionCookie = cookie.split(';')[0];

    // Sin cookie →401.
    const withoutCookie = await request(app.getHttpServer()).get('/auth/me');
    expect(withoutCookie.status).toBe(401);
    expect(withoutCookie.body.error.code).toBe('UNAUTHORIZED');

    // Con cookie → perfil.
    const me = await request(app.getHttpServer()).get('/auth/me').set('Cookie', sessionCookie);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('admin@consultorio.local');
    expect(me.body.user.role.key).toBe('ADMIN');

    // Logout → revoca y limpia la cookie.
    const logout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', sessionCookie);
    expect(logout.status).toBe(200);
    expect(logout.headers['set-cookie'][0]).toContain('odon_session=;');

    const meAfterLogout = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', sessionCookie);
    expect(meAfterLogout.status).toBe(401);
    expect(meAfterLogout.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('bloquea requests mutantes con Origin de un sitio de terceros (CSRF)', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'https://sitio-malicioso.example')
      .send({ email: 'admin@consultorio.local', password: 'Cualquiera1' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
  });

  it('permite el Origin del frontend configurado (WEB_ORIGIN)', async () => {
    const webOrigin = process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', webOrigin)
      .send({ email: 'admin@consultorio.local', password: 'PasswordIncorrecta1' });

    // Llega al servicio de auth (401), no lo corta el guard CSRF.
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('permite el Origin del escritorio Tauri: CORS + cookie SameSite=None; Secure (fase 11)', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'http://tauri.localhost')
      .send({ email: 'admin@consultorio.local', password: 'Admin1234!' });

    // Llega al servicio de auth y responde con CORS habilitado (no lo corta
    // el guard CSRF): la webview de Tauri es cross-site con localhost, así
    // que la sesión se setea con SameSite=None; Secure (ADR-015).
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://tauri.localhost');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('; Secure');
    expect(cookie).toContain('SameSite=None');
  });

  it('mantiene SameSite=Lax para el login del web (ADR-012)', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'admin@consultorio.local', password: 'Admin1234!' });

    expect(response.status).toBe(200);
    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('SameSite=None');
  });

  it('emite SameSite=None; Secure en el web con SESSION_COOKIE_SAMESITE=none (ADR-016)', async () => {
    // Despliegue: web y API en dominios distintos (cross-site). La env fuerza
    // el modo escritorio para cualquier origen. Se restaura al finalizar para
    // no afectar a otros tests del proceso.
    process.env.SESSION_COOKIE_SAMESITE = 'none';
    try {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({ email: 'admin@consultorio.local', password: 'Admin1234!' });

      expect(response.status).toBe(200);
      const cookie = response.headers['set-cookie']?.[0] ?? '';
      expect(cookie).toContain('SameSite=None');
      expect(cookie).toContain('; Secure');
    } finally {
      delete process.env.SESSION_COOKIE_SAMESITE;
    }
  });
});
