import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { CreateToothEventInput, UpdateToothInput } from '@odonto/validation';
import { createToothEventSchema, updateToothSchema } from '@odonto/validation';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import type { Tooth } from '../generated/prisma/client';
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
 * Odontograma (SDD CU-09): dientes del paciente, historial por diente y
 * registro de eventos/observaciones. Requiere `odontogram.read` para lectura
 * y `odontogram.write` para mutaciones.
 */
@Controller()
@RequirePermission('odontogram.read')
export class OdontogramController {
  constructor(private readonly odontogramService: OdontogramService) {}

  @Get('patients/:id/teeth')
  listTeeth(@Param('id', UuidParamPipe) id: string): Promise<Tooth[]> {
    return this.odontogramService.listTeeth(id);
  }

  @Get('teeth/:id/events')
  listEvents(@Param('id', UuidParamPipe) id: string): Promise<ToothEventWithAuthor[]> {
    return this.odontogramService.listEvents(id);
  }

  @Post('teeth/:id/events')
  @RequirePermission('odontogram.write')
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
  updateTooth(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateToothSchema)) body: UpdateToothInput,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<Tooth> {
    return this.odontogramService.updateTooth(id, body, actorOf(user, req));
  }
}
