import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  service: string;
}

const healthResponseSchema: SchemaObject = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' },
    service: { type: 'string' },
  },
  required: ['status', 'timestamp', 'service'],
};

/**
 * Endpoint de salud para smoke tests y healthchecks de Docker/CI.
 * No expone información del consultorio (SDD §1: pantalla inicial sin sesión
 * no muestra información interna; este endpoint tampoco la contiene).
 */
@ApiTags('Salud')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Healthcheck público',
    description: 'OK si el servicio está vivo. No requiere sesión ni expone datos.',
  })
  @ApiOkResponse({ description: 'Servicio activo.', schema: healthResponseSchema })
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'odontologia-api',
    };
  }
}
