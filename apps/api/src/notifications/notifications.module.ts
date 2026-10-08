import { Global, Module } from '@nestjs/common';
import { MAIL_PROVIDER } from './mail.provider';
import { LogMailProvider } from './log-mail.provider';

@Global()
@Module({
  providers: [{ provide: MAIL_PROVIDER, useClass: LogMailProvider }],
  exports: [MAIL_PROVIDER],
})
export class NotificationsModule {}
