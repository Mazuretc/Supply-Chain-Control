import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminSessionGuard } from './admin-session.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  CSRF_UTILITIES,
  createCsrfUtilities,
} from '../config/csrf.provider';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AdminSessionGuard,
    {
      provide: CSRF_UTILITIES,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createCsrfUtilities(
          config.getOrThrow<string>('CSRF_SECRET'),
          config.get<string>('NODE_ENV') === 'production',
        ),
    },
  ],
  exports: [CSRF_UTILITIES, AdminSessionGuard],
})
export class AuthModule {}
