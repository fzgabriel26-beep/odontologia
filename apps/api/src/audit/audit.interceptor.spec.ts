import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { ConflictException, Controller, Get, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditModule } from './audit.module';
import { AuditService } from './audit.service';

/**
 * Tests del interceptor de auditoría (SDD fase 9 / ADR-014): red de seguridad
 * que escribe una fila API_MUTATION cuando una mutación exitosa no dejó
 * auditoría de dominio, no duplica cuando la dejó, ignora GET y no registra
 * respuestas de error. Usa un controlador sonda sin guards (el interceptor
 * debe funcionar también con requests sin sesión).
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

/** Rutas sonda: cada caso cubre una rama del interceptor. */
@Controller('probe-audit')
class ProbeController {
  constructor(private readonly audit: AuditService) {}

  /** Sin auditoría explícita → debe generar la fila API_MUTATION. */
  @Post('silent')
  silent(): { ok: boolean } {
    return { ok: true };
  }

  /** Con auditoría explícita → el interceptor no debe duplicar. */
  @Post('logged')
  async logged(): Promise<{ ok: boolean }> {
    await this.audit.log({
      action: 'PATIENT_UPDATED',
      entityType: 'PROBE',
      metadata: { probe: true },
    });
    return { ok: true };
  }

  /** GET → el interceptor no audita lecturas. */
  @Get('ignored')
  ignored(): { ok: boolean } {
    return { ok: true };
  }

  /** Error de negocio → no debe generar fila API_MUTATION. */
  @Post('fail')
  fail(): never {
    throw new ConflictException('Fallo deliberado del sonda.');
  }
}

describe('AuditInterceptor (HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditModule],
      controllers: [ProbeController],
      providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    // Solo filas de las rutas sonda (entityType PROBE / rutas /probe-audit).
    await prisma.auditLog.deleteMany({ where: { entityType: 'PROBE' } });
    await prisma.auditLog.deleteMany({ where: { entityType: 'API' } });
    await app?.close();
  });

  it('escribe API_MUTATION en una mutación exitosa sin auditoría explícita', async () => {
    const response = await request(app.getHttpServer()).post('/probe-audit/silent');
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ok: true });

    // La fila debe existir antes de responder (el interceptor espera la escritura).
    const row = await prisma.auditLog.findFirst({
      where: { action: 'API_MUTATION', metadata: { path: ['path'], equals: '/probe-audit/silent' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).not.toBeNull();
    if (row) {
      expect(row.userId).toBeNull(); // sin sesión en el sonda
      expect(row.entityId).toBeNull();
      expect(row.metadata).toEqual({ method: 'POST', path: '/probe-audit/silent' });
      expect(row.ip).toBeTruthy();
    }
  });

  it('no duplica cuando el handler ya dejó auditoría de dominio', async () => {
    const response = await request(app.getHttpServer()).post('/probe-audit/logged');
    expect(response.status).toBe(201);

    const explicit = await prisma.auditLog.findFirst({
      where: { entityType: 'PROBE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(explicit).not.toBeNull(); // la auditoría explícita sí quedó

    const fallback = await prisma.auditLog.findFirst({
      where: { action: 'API_MUTATION', metadata: { path: ['path'], equals: '/probe-audit/logged' } },
    });
    expect(fallback).toBeNull(); // y el interceptor no agregó su fila
  });

  it('ignora las lecturas (GET)', async () => {
    const response = await request(app.getHttpServer()).get('/probe-audit/ignored');
    expect(response.status).toBe(200);

    const rows = await prisma.auditLog.count({
      where: { metadata: { path: ['path'], equals: '/probe-audit/ignored' } },
    });
    expect(rows).toBe(0);
  });

  it('no registra respuestas de error', async () => {
    const response = await request(app.getHttpServer()).post('/probe-audit/fail');
    expect(response.status).toBe(409);

    const rows = await prisma.auditLog.count({
      where: { action: 'API_MUTATION', metadata: { path: ['path'], equals: '/probe-audit/fail' } },
    });
    expect(rows).toBe(0);
  });
});
