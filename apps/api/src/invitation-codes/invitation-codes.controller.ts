import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import type { CreateInvitationCodeInput } from '@odonto/validation';
import { createInvitationCodeSchema } from '@odonto/validation';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { zodToSchema, arrayOf } from '../swagger/zod-schema';
import { InvitationCodesService, type InvitationCodeView } from './invitation-codes.service';

interface RequestWithIp {
  ip?: string;
}

/** Autor sin id: la vista solo incluye nombre y apellido. */
const codeAuthorSchema: SchemaObject = {
  type: 'object',
  properties: {
    firstName: { type: 'string' },
    lastName: { type: 'string' },
  },
  required: ['firstName', 'lastName'],
};

/**
 * Vista real de `InvitationCodeView` (difiere del `invitationCodeSchema`
 * compartido: agrega `displayStatus` y el autor viene sin id).
 */
const invitationCodeViewSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    code: { type: 'string', description: 'Código ODONTO-XXXX-XXXX (no hay registro público).' },
    role: {
      type: 'object',
      properties: {
        key: { type: 'string', enum: ['ADMIN', 'ODONTOLOGO', 'SECRETARIO'] },
        name: { type: 'string' },
      },
      required: ['key', 'name'],
      description: 'Rol que otorga el código.',
    },
    status: { type: 'string', enum: ['DISPONIBLE', 'UTILIZADO', 'EXPIRADO', 'REVOGADO'] },
    displayStatus: {
      type: 'string',
      enum: ['DISPONIBLE', 'UTILIZADO', 'EXPIRADO', 'REVOGADO'],
      description: 'Estado para mostrar: DISPONIBLE vencido se ve como EXPIRADO.',
    },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    revokedAt: { type: 'string', format: 'date-time', nullable: true },
    usedAt: { type: 'string', format: 'date-time', nullable: true },
    createdBy: { ...codeAuthorSchema, nullable: true, description: 'Administrador que lo generó.' },
    usedBy: { ...codeAuthorSchema, nullable: true, description: 'Usuario que lo utilizó.' },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'code', 'role', 'status', 'displayStatus', 'createdAt'],
};

/**
 * Códigos de invitación (SDD CU-04): generar, consultar y revocar.
 * Requiere el permiso `invitation.manage` (solo rol ADMIN en el MVP).
 */
@ApiTags('Invitaciones')
@ApiSecurity('sessionCookie')
@Controller('invitation-codes')
@RequirePermission('invitation.manage')
export class InvitationCodesController {
  constructor(private readonly codesService: InvitationCodesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar códigos de invitación',
    description:
      'Historial completo de códigos (disponibles, usados, expirados o revocados), ordenado ' +
      'por creación. Requiere `invitation.manage`.',
  })
  @ApiOkResponse({
    description: 'Códigos de invitación.',
    schema: arrayOf(invitationCodeViewSchema),
  })
  list(): Promise<InvitationCodeView[]> {
    return this.codesService.list();
  }

  @Post()
  @ApiOperation({
    summary: 'Generar un código de invitación',
    description:
      'Crea un código con rol (ADR-013) y expiración opcional de 1 a 365 días. No existe ' +
      'registro público: el código es obligatorio para registrarse. Audita ' +
      'INVITATION_CODE_CREATED.',
  })
  @ApiBody({ schema: zodToSchema(createInvitationCodeSchema) })
  @ApiCreatedResponse({ description: 'Código generado.', schema: invitationCodeViewSchema })
  create(
    @Body(new ZodValidationPipe(createInvitationCodeSchema)) body: CreateInvitationCodeInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<InvitationCodeView> {
    return this.codesService.create(body, { id: user.id, ip: req.ip });
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Revocar un código de invitación',
    description:
      'Pasa el código a REVOGADO si todavía está DISPONIBLE (409 si ya fue usado, expirado ' +
      'o revocado) y audita INVITATION_CODE_REVOKED.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del código de invitación' })
  @ApiOkResponse({ description: 'Código revocado.', schema: invitationCodeViewSchema })
  revoke(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<InvitationCodeView> {
    return this.codesService.revoke(id, { id: user.id, ip: req.ip });
  }
}
