import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeadlineResolverService } from './deadline-resolver.service';
import { ExcelExtractionService } from './excel-extraction.service';
import { MailProcessingService } from './mail-processing.service';
import { OpenAiCompatibleExtractionService } from './openai-compatible-extraction.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [
    ExcelExtractionService,
    {
      provide: OpenAiCompatibleExtractionService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new OpenAiCompatibleExtractionService({
          baseUrl: config.getOrThrow<string>('GPT_BASE_URL'),
          apiKey: config.getOrThrow<string>('GPT_API_KEY'),
          model: config.getOrThrow<string>('GPT_MODEL'),
        }),
    },
    {
      provide: DeadlineResolverService,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) =>
        new DeadlineResolverService(
          prisma,
          config.get<number>('EXTRACTION_MIN_CONFIDENCE', 0.75),
        ),
    },
    MailProcessingService,
  ],
  exports: [MailProcessingService, DeadlineResolverService],
})
export class ExtractionModule {}
