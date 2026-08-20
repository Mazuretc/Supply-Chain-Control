import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialEncryptionService } from './credential-encryption.service';
import { PasswordService } from './password.service';

@Global()
@Module({
  providers: [
    PasswordService,
    {
      provide: CredentialEncryptionService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new CredentialEncryptionService(
          config.getOrThrow<string>('IMAP_CREDENTIALS_KEY'),
        ),
    },
  ],
  exports: [CredentialEncryptionService, PasswordService],
})
export class SecurityModule {}
