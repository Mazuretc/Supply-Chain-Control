import { Module } from '@nestjs/common';
import { ImapPollingService } from './imap-polling.service';
import { MailIngestionService } from './mail-ingestion.service';

@Module({
  providers: [MailIngestionService, ImapPollingService],
  exports: [MailIngestionService, ImapPollingService],
})
export class MailIngestionModule {}
