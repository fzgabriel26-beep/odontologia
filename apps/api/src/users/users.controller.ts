import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
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
import { UsersService, type AdminActor, type AdminUserView } from './users.service';

interface RequestWithIp {
  ip?: string;
}

function actorOf(user: AuthUser, req: RequestWithIp): AdminActor {
  return { id: user.id, ip: req.ip };
}

/**
 * Gestión de usuarios (SDD CU-05): alta, edición, rol y estado.
 * Requiere el permiso `users.manage` (solo rol ADMIN en el MVP).
 */
@Controller('users')
@RequirePermission('users.manage')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(@Query('query') query?: string): Promise<AdminUserView[]> {
    return this.usersService.list(query);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<AdminUserView> {
    return this.usersService.create(body, actorOf(user, req));
  }

  @Get(':id')
  get(@Param('id', UuidParamPipe) id: string): Promise<AdminUserView> {
    return this.usersService.get(id);
  }

  @Patch(':id')
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
