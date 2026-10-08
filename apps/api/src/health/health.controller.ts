import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  service: string;
}

/**
 * Endpoint de salud para smoke tests y healthchecks de Docker/CI.
 * No expone información del consultorio (SDD §1: pantalla inicial sin sesión
 * no muestra información interna; este endpoint tampoco la contiene).
 */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'odontologia-api',
    };
  }
}
