import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailAccountController } from './mail-account.controller';
import { MailAccountService } from './mail-account.service';
import { MailCredentialService } from './mail-credential.service';

@Module({
  imports: [AuthModule],
  controllers: [MailAccountController],
  providers: [MailAccountService, MailCredentialService],
})
export class MailAccountModule {}
