import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/**
 * ¿Swagger debe montarse? (SDD §9 / ADR-017)
 *
 * - Fuera de producción (dev local): siempre.
 * - En producción: solo si `SWAGGER_ENABLED=true` (la demo pública corre con
 *   las docs apagadas para no exponer la superficie de la API).
 */
export function swaggerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' || env.SWAGGER_ENABLED === 'true';
}

/**
 * Monta Swagger UI en `/api/v1/docs` con el documento OpenAPI generado a
 * partir de los decoradores de los controladores (SDD §9, fase 12).
 *
 * - Inputs: schemas Zod vía `zodToSchema` (misma fuente que la validación).
 * - Auth: cookie de sesión opaca `odon_session` (esquema `sessionCookie`).
 */
export function setupSwagger(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Sistema de Gestión Odontológica — API')
    .setDescription(
      'API REST del Sistema de Gestión Odontológica (SDD). ' +
        'Autenticación por cookie opaca `odon_session` (HttpOnly + Secure + SameSite=None); ' +
        'los endpoints no públicos requieren sesión y los permisos RBAC se verifican ' +
        'siempre en backend (SDD §10). Datos sensibles: solo datos de prueba.',
    )
    .setVersion('1.0.0')
    .build();

  config.components = {
    ...(config.components ?? {}),
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'odon_session',
        description: 'Cookie de sesión opaca. Se obtiene en POST /api/v1/auth/login.',
      },
    },
  };

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document, {
    customSiteTitle: 'Odontología API — documentación',
    swaggerOptions: { persistAuthorization: true },
  });
  return document;
}
