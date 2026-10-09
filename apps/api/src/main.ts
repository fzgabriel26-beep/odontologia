import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsOptions } from './common/utils/origins';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  // Orígenes permitidos: web (localhost:3000) y escritorio Tauri
  // (tauri.localhost), ADR-015.
  app.enableCors(corsOptions());

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  // Log sin información sensible (SDD §7).
  console.warn(`API escuchando en http://localhost:${port}/api/v1`);
}

void bootstrap();
