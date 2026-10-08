import { applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

/**
 * Rate limiting estricto para endpoints de autenticación
 * (fuerza bruta, abuso de recuperación de contraseña).
 * Valores: RATE_LIMIT_MAX intentos por RATE_LIMIT_TTL_SEC segundos.
 */
export const AuthRateLimit = () =>
  applyDecorators(
    Throttle({
      default: {
        limit: Number(process.env.RATE_LIMIT_MAX ?? 10),
        ttl: Number(process.env.RATE_LIMIT_TTL_SEC ?? 60) * 1000,
      },
    }),
  );
