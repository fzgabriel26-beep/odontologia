import '../common/config/env';
import { Module } from '@nestjs/common';
import { InvitationCodesController } from './invitation-codes.controller';
import { InvitationCodesService } from './invitation-codes.service';

@Module({
  controllers: [InvitationCodesController],
  providers: [InvitationCodesService],
  exports: [InvitationCodesService],
})
export class InvitationCodesModule {}
