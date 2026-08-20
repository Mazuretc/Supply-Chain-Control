import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RetentionService } from './retention.service';

@Module({
  providers: [
    {
      provide: RetentionService,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) =>
        new RetentionService(prisma, config.get<number>('RETENTION_DAYS', 90)),
    },
  ],
  exports: [RetentionService],
})
export class RetentionModule {}
