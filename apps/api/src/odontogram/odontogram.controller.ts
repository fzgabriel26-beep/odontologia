import { Body, Controller, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import type { ServerResponse } from 'node:http';
import type { CreateToothEventInput, UpdateToothInput } from '@odonto/validation';
import { createToothEventSchema, updateToothSchema } from '@odonto/validation';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import type { Tooth } from '../generated/prisma/client';
import { toothEventSchema, toothSchema } from '../swagger/response-schemas';
import { arrayOf, zodToSchema } from '../swagger/zod-schema';
import { OdontogramPdfService } from './odontogram-pdf.service';
import {
  OdontogramService,
  type OdontogramActor,
  type ToothEventWithAuthor,
} from './odontogram.service';

interface RequestWithIp {
  ip?: string;
}

function actorOf(user: AuthUser, req: RequestWithIp): OdontogramActor {
  return { id: user.id, ip: req.ip };
}

/**
 * Evento dental con autor (`ToothEventWithAuthor`): el schema compartido más
 * `createdById`, que el servicio devuelve en cada evento.
 */
const toothEventWithAuthorSchema: SchemaObject = {
  ...toothEventSchema,
  properties: {
    ...toothEventSchema.properties,
    createdById: { type: 'string', format: 'uuid', description: 'Usuario que registró el evento.' },
  },
  required: [...(toothEventSchema.required ?? []), 'createdById'],
};

/**
 * Odontograma (SDD CU-09): dientes del paciente, historial por diente y
 * registro de eventos/observaciones. Requiere `odontogram.read` para lectura
 * y `odontogram.write` para mutaciones.
 */
@ApiTags('Odontograma')
@ApiSecurity('sessionCookie')
@Controller()
@RequirePermission('odontogram.read')
export class OdontogramController {
  constructor(
    private readonly odontogramService: OdontogramService,
    private readonly pdfService: OdontogramPdfService,
  ) {}

  @Get('patients/:id/teeth')
  @ApiOperation({
    summary: 'Listar los dientes de un paciente',
    description: 'Los 52 dientes del paciente (11 → 48 / 51 → 85) ordenados por número FDI.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del paciente.' })
  @ApiOkResponse({ description: 'Dientes del paciente.', schema: arrayOf(toothSchema) })
  listTeeth(@Param('id', UuidParamPipe) id: string): Promise<Tooth[]> {
    return this.odontogramService.listTeeth(id);
  }

  /**
   * Exportación a PDF (CU-11 / ADR-004 / fase 10): el backend renderiza el
   * odontograma con Playwright y el cliente solo descarga el binario, siempre
   * con sesión y permiso (mismo proxy autenticado que los archivos médicos).
   */
  @Get('patients/:id/odontogram.pdf')
  @ApiOperation({
    summary: 'Exportar el odontograma en PDF',
    description:
      'Playwright renderiza el PDF en backend y el cliente solo descarga el binario; ' +
      'siempre con sesión y permiso `odontogram.read`.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del paciente.' })
  @ApiResponse({
    status: 200,
    description: 'PDF del odontograma (descarga).',
    content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
  })
  async exportPdf(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
    @Res() res: ServerResponse,
  ): Promise<void> {
    const { buffer, filename } = await this.pdfService.exportPdf(id, {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      ip: req.ip,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(buffer);
  }

  @Get('teeth/:id/events')
  @ApiOperation({
    summary: 'Listar los eventos de un diente',
    description:
      'Historial del diente (más recientes primero) con el autor de cada evento; ' +
      'los eventos son ineliminables (insert-only).',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del diente.' })
  @ApiOkResponse({
    description: 'Eventos del diente.',
    schema: arrayOf(toothEventWithAuthorSchema),
  })
  listEvents(@Param('id', UuidParamPipe) id: string): Promise<ToothEventWithAuthor[]> {
    return this.odontogramService.listEvents(id);
  }

  @Post('teeth/:id/events')
  @RequirePermission('odontogram.write')
  @ApiOperation({
    summary: 'Registrar un evento dental',
    description:
      'Crea el evento y actualiza el estado actual del diente en la misma transacción; ' +
      'queda auditado dos veces (evento y diente).',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del diente.' })
  @ApiBody({ schema: zodToSchema(createToothEventSchema) })
  @ApiCreatedResponse({ description: 'Evento registrado.', schema: toothEventWithAuthorSchema })
  createEvent(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(createToothEventSchema)) body: CreateToothEventInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<ToothEventWithAuthor> {
    return this.odontogramService.createEvent(id, body, actorOf(user, req));
  }

  @Patch('teeth/:id')
  @RequirePermission('odontogram.write')
  @ApiOperation({
    summary: 'Actualizar las observaciones de un diente',
    description: 'Panel lateral del odontograma; exige al menos un campo para modificar.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del diente.' })
  @ApiBody({ schema: zodToSchema(updateToothSchema) })
  @ApiOkResponse({ description: 'Diente actualizado.', schema: toothSchema })
  updateTooth(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateToothSchema)) body: UpdateToothInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<Tooth> {
    return this.odontogramService.updateTooth(id, body, actorOf(user, req));
  }
}
