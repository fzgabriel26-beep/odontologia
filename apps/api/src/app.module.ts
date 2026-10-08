import './common/config/env';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CsrfOriginGuard } from './common/guards/csrf-origin.guard';
import { SessionGuard } from './common/guards/session.guard';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // .env en la raíz del monorepo (desarrollo) o junto a la app (producción).
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '../.env', '.env'] }),
    // Rate limiting global (fuerza bruta / abuso); /auth/* lo refina por ruta.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60_000, limit: Number(process.env.APP_RATE_LIMIT_MAX ?? 120) },
      ],
    }),
    PrismaModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: CsrfOriginGuard },
  ],
})
export class AppModule {}
