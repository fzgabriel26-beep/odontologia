import '../common/config/env';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionsService],
  exports: [AuthService, SessionsService],
})
export class AuthModule {}
