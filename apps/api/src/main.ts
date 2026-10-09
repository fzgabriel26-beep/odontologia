import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsOptions } from './common/utils/origins';
import { securityHeaders } from './common/utils/security-headers';
import { setupSwagger, swaggerEnabled } from './swagger/setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Headers de seguridad en TODA respuesta (ADR-017, fase 12).
  app.use(securityHeaders);
  app.setGlobalPrefix('api/v1');
  // Orígenes permitidos: web (localhost:3000) y escritorio Tauri
  // (tauri.localhost), ADR-015.
  app.enableCors(corsOptions());

  // Swagger (SDD §9, ADR-017): en dev siempre; en producción solo con
  // SWAGGER_ENABLED=true (la demo pública corre sin docs expuestas).
  if (swaggerEnabled()) {
    setupSwagger(app);
  }

  // Puerto: `API_PORT` local (por defecto 3001) o el que inyecta la
  // plataforma de despliegue (Render usa `PORT`, ADR-016).
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
  await app.listen(port);
  // Log sin información sensible (SDD §7).
  console.warn(`API escuchando en http://localhost:${port}/api/v1`);
}

void bootstrap();
