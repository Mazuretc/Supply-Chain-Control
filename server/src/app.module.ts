import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { validateEnvironment } from './config/env.validation';
import { ExtractionModule } from './extraction/extraction.module';
import { JobsModule } from './jobs/jobs.module';
import { MailAccountModule } from './mail-accounts/mail-account.module';
import { MailIngestionModule } from './mail-ingestion/mail-ingestion.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { RetentionModule } from './retention/retention.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 100, ttl: 60_000 }],
    }),
    PrismaModule,
    SecurityModule,
    AuthModule,
    MailAccountModule,
    OrdersModule,
    MailIngestionModule,
    ExtractionModule,
    AuditModule,
    JobsModule,
    RetentionModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
