import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { CreateInvitationCodeInput } from '@odonto/validation';
import { createInvitationCodeSchema } from '@odonto/validation';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { InvitationCodesService, type InvitationCodeView } from './invitation-codes.service';

interface RequestWithIp {
  ip?: string;
}

/**
 * Códigos de invitación (SDD CU-04): generar, consultar y revocar.
 * Requiere el permiso `invitation.manage` (solo rol ADMIN en el MVP).
 */
@Controller('invitation-codes')
@RequirePermission('invitation.manage')
export class InvitationCodesController {
  constructor(private readonly codesService: InvitationCodesService) {}

  @Get()
  list(): Promise<InvitationCodeView[]> {
    return this.codesService.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createInvitationCodeSchema)) body: CreateInvitationCodeInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<InvitationCodeView> {
    return this.codesService.create(body, { id: user.id, ip: req.ip });
  }

  @Post(':id/revoke')
  @HttpCode(200)
  revoke(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<InvitationCodeView> {
    return this.codesService.revoke(id, { id: user.id, ip: req.ip });
  }
}
