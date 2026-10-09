import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import type {
  AdminResetPasswordInput,
  ChangeUserRoleInput,
  ChangeUserStatusInput,
  CreateUserInput,
  UpdateUserInput,
} from '@odonto/validation';
import {
  adminResetPasswordSchema,
  changeUserRoleSchema,
  changeUserStatusSchema,
  createUserSchema,
  updateUserSchema,
} from '@odonto/validation';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { okSchema } from '../swagger/response-schemas';
import { arrayOf, zodToSchema } from '../swagger/zod-schema';
import { UsersService, type AdminActor, type AdminUserView } from './users.service';

interface RequestWithIp {
  ip?: string;
}

function actorOf(user: AuthUser, req: RequestWithIp): AdminActor {
  return { id: user.id, ip: req.ip };
}

/**
 * Vista real de `AdminUserView` (difiere del `adminUserSchema` compartido:
 * el panel no recibe `phone` ni `updatedAt`, y nunca el hash de contraseña).
 */
const adminUserViewSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    dni: { type: 'string', description: 'DNI (único, nunca es la clave primaria).' },
    email: { type: 'string', format: 'email' },
    role: {
      type: 'object',
      properties: {
        key: { type: 'string', enum: ['ADMIN', 'ODONTOLOGO', 'SECRETARIO'] },
        name: { type: 'string' },
      },
      required: ['key', 'name'],
    },
    status: { type: 'string', enum: ['ACTIVO', 'INACTIVO'] },
    lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'firstName', 'lastName', 'dni', 'email', 'role', 'status', 'createdAt'],
  description: 'Nunca expone el hash de contraseña.',
};

/**
 * Gestión de usuarios (SDD CU-05): alta, edición, rol y estado.
 * Requiere el permiso `users.manage` (solo rol ADMIN en el MVP).
 */
@ApiTags('Usuarios')
@ApiSecurity('sessionCookie')
@Controller('users')
@RequirePermission('users.manage')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar usuarios',
    description:
      'Listado del panel de administración ordenado por apellido; búsqueda opcional por ' +
      'nombre, email o DNI. Requiere `users.manage`.',
  })
  @ApiQuery({
    name: 'query',
    required: false,
    description: 'Texto de búsqueda (nombre, apellido, email o DNI, sin distinguir mayúsculas).',
  })
  @ApiOkResponse({ description: 'Usuarios encontrados.', schema: arrayOf(adminUserViewSchema) })
  list(@Query('query') query?: string): Promise<AdminUserView[]> {
    return this.usersService.list(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear un usuario',
    description:
      'Alta directa por administrador, sin código de invitación (SDD CU-05). Valida email y ' +
      'DNI únicos, hashea la contraseña con argon2 y audita USER_CREATED.',
  })
  @ApiBody({ schema: zodToSchema(createUserSchema) })
  @ApiCreatedResponse({ description: 'Usuario creado.', schema: adminUserViewSchema })
  create(
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<AdminUserView> {
    return this.usersService.create(body, actorOf(user, req));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un usuario',
    description:
      'Detalle del usuario para el panel; nunca expone el hash de contraseña. ' +
      'Requiere `users.manage`.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del usuario' })
  @ApiOkResponse({ description: 'Usuario encontrado.', schema: adminUserViewSchema })
  get(@Param('id', UuidParamPipe) id: string): Promise<AdminUserView> {
    return this.usersService.get(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar un usuario',
    description:
      'Actualiza datos personales (nombre, apellido, DNI y email), todos opcionales; el rol ' +
      'y el estado tienen endpoint propio. Audita USER_UPDATED.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del usuario' })
  @ApiBody({ schema: zodToSchema(updateUserSchema) })
  @ApiOkResponse({ description: 'Usuario actualizado.', schema: adminUserViewSchema })
  update(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<AdminUserView> {
    return this.usersService.update(id, body, actorOf(user, req));
  }

  @Post(':id/status')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cambiar el estado de un usuario',
    description:
      'Activa o desactiva la cuenta (ACTIVO/INACTIVO): no se puede cambiar el propio ' +
      'estado, al desactivar se cierran sus sesiones y debe quedar al menos un ' +
      'ADMIN activo. Audita USER_STATUS_CHANGED.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del usuario' })
  @ApiBody({ schema: zodToSchema(changeUserStatusSchema) })
  @ApiOkResponse({ description: 'Estado actualizado.', schema: adminUserViewSchema })
  changeStatus(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(changeUserStatusSchema)) body: ChangeUserStatusInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<AdminUserView> {
    return this.usersService.changeStatus(id, body, actorOf(user, req));
  }

  @Post(':id/role')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cambiar el rol de un usuario',
    description:
      'Cambia el rol (ADMIN, ODONTOLOGO o SECRETARIO) y con él los permisos (RBAC). No se ' +
      'puede cambiar el propio rol ni dejar de ser el último ADMIN activo. Audita ' +
      'USER_ROLE_CHANGED.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del usuario' })
  @ApiBody({ schema: zodToSchema(changeUserRoleSchema) })
  @ApiOkResponse({ description: 'Rol actualizado.', schema: adminUserViewSchema })
  changeRole(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(changeUserRoleSchema)) body: ChangeUserRoleInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<AdminUserView> {
    return this.usersService.changeRole(id, body, actorOf(user, req));
  }

  /** Reset de contraseña por administrador (ADR-005). */
  @Post(':id/password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Resetear la contraseña de un usuario',
    description:
      'El administrador define una contraseña nueva sin conocer la actual (ADR-005): se ' +
      'hashea con argon2, se cierran todas las sesiones del usuario y no se permite sobre ' +
      'el propio usuario. Audita PASSWORD_RESET_BY_ADMIN.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del usuario' })
  @ApiBody({ schema: zodToSchema(adminResetPasswordSchema) })
  @ApiOkResponse({ description: 'Contraseña actualizada.', schema: okSchema })
  async resetPassword(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(adminResetPasswordSchema)) body: AdminResetPasswordInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<{ ok: true }> {
    await this.usersService.resetPassword(id, body.password, actorOf(user, req));
    return { ok: true };
  }
}
