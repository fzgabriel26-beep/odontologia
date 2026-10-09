import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject, OperationObject, SchemaObject } from '@nestjs/swagger';
import { setupSwagger, swaggerEnabled } from './setup';

/**
 * Tests de la documentación Swagger (SDD §9, fase 12).
 *
 * Verifica que el documento OpenAPI se genere completo: prefijo global,
 * esquema de cookie de sesión, bodies derivados de los schemas Zod y que
 * TODA operación tenga summary, tag y respuesta documentados.
 */

const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

describe('Swagger (SDD §9, fase 12)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const { AppModule } = await import('../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    document = setupSwagger(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('solo se monta en dev o con SWAGGER_ENABLED=true (ADR-017)', () => {
    expect(swaggerEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(swaggerEnabled({ NODE_ENV: 'test' })).toBe(true);
    expect(swaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(swaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })).toBe(true);
    expect(swaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'false' })).toBe(false);
  });

  it('genera el documento con el prefijo global /api/v1', () => {
    expect(Object.keys(document.paths).length).toBeGreaterThanOrEqual(36);
    expect(document.paths['/api/v1/auth/login']?.post).toBeDefined();
    expect(document.paths['/api/v1/health']?.get).toBeDefined();
  });

  it('declara el esquema de cookie de sesión (sessionCookie)', () => {
    expect(document.components?.securitySchemes?.['sessionCookie']).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'odon_session',
    });
  });

  it('documenta el body de login desde el schema Zod (fuente única)', () => {
    const login = document.paths['/api/v1/auth/login']?.post;
    const body = login?.requestBody as
      { content?: Record<string, { schema?: SchemaObject }> } | undefined;
    const schema = body?.content?.['application/json']?.schema;
    expect(schema?.properties).toHaveProperty('email');
    expect(schema?.properties).toHaveProperty('password');
    expect(schema?.required).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('toda operación tiene summary, tag y al menos una respuesta', () => {
    const problems: string[] = [];
    for (const [path, item] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(item ?? {})) {
        if (!HTTP_METHODS.includes(method)) continue;
        const op = operation as OperationObject;
        const where = `${method.toUpperCase()} ${path}`;
        if (!op.summary) problems.push(`${where}: sin summary`);
        if (!op.tags || op.tags.length === 0) problems.push(`${where}: sin tag`);
        if (!op.responses || Object.keys(op.responses).length === 0) {
          problems.push(`${where}: sin respuestas`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
