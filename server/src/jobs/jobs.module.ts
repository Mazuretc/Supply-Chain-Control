import { Module } from '@nestjs/common';
import { ExtractionModule } from '../extraction/extraction.module';
import { MailIngestionModule } from '../mail-ingestion/mail-ingestion.module';
import { RetentionModule } from '../retention/retention.module';
import { JobsService } from './jobs.service';
import { MailWorkerService } from './mail-worker.service';

@Module({
  imports: [MailIngestionModule, ExtractionModule, RetentionModule],
  providers: [JobsService, MailWorkerService],
  exports: [JobsService, MailWorkerService],
})
export class JobsModule {}
