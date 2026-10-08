import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
    // Para que el front pueda leer el nombre del archivo (PDF del odontograma).
    exposedHeaders: ['Content-Disposition'],
  });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  // Log sin información sensible (SDD §7).
  console.warn(`API escuchando en http://localhost:${port}/api/v1`);
}

void bootstrap();
