import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // .env en la raíz del monorepo (desarrollo) o junto a la app (producción).
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '../.env', '.env'] }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
