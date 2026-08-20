import { Injectable, OnModuleInit } from '@nestjs/common';
import { MailProcessingService } from '../extraction/mail-processing.service';
import { ImapPollingService } from '../mail-ingestion/imap-polling.service';
import { PrismaService } from '../prisma/prisma.service';
import { RetentionService } from '../retention/retention.service';
import { JobsService } from './jobs.service';

@Injectable()
export class MailWorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly polling: ImapPollingService,
    private readonly jobs: JobsService,
    private readonly processing: MailProcessingService,
    private readonly retention: RetentionService,
    private readonly pollIntervalSeconds = 60,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.recoverStale();
  }

  async runOnce(): Promise<void> {
    const db = this.prisma as any;
    const accounts = await db.mailAccount.findMany({ where: { enabled: true } });
    const pollSlot = Math.floor(
      Date.now() / (this.pollIntervalSeconds * 1_000),
    );
    for (const account of accounts) {
      await this.jobs.enqueue(
        'POLL_MAIL_ACCOUNT',
        `poll-mail-account:${account.id}:${pollSlot}`,
        { accountId: account.id },
      );
    }

    const retentionDate = new Date().toISOString().slice(0, 10);
    await this.jobs.enqueue('RETENTION', `retention:${retentionDate}`, {
      scheduledDate: retentionDate,
    });

    for (;;) {
      const job = await this.jobs.claimNext();
      if (!job) break;
      await this.jobs.heartbeat(job.id);
      const heartbeat = setInterval(() => {
        void this.jobs.heartbeat(job.id);
      }, 30_000);
      heartbeat.unref();
      try {
        const payload = job.payload as Record<string, unknown>;
        if (job.type === 'PROCESS_MAIL' && typeof payload.messageId === 'string') {
          await this.processing.process(payload.messageId, job.id);
        } else if (
          job.type === 'POLL_MAIL_ACCOUNT' &&
          typeof payload.accountId === 'string'
        ) {
          const account = await db.mailAccount.findUniqueOrThrow({
            where: { id: payload.accountId, enabled: true },
          });
          await this.polling.pollAccount(
            account,
            account.lastPolledAt ?? undefined,
          );
          await db.mailAccount.update({
            where: { id: account.id },
            data: { lastPolledAt: new Date() },
          });
        } else if (job.type === 'RETENTION') {
          await this.retention.purge();
        } else {
          throw new Error(`Unsupported job type or payload: ${job.type}`);
        }
        await this.jobs.succeed(job.id);
      } catch (error) {
        await this.jobs.fail(
          {
            id: job.id,
            type: job.type,
            attempts: job.attempts ?? 1,
          },
          error,
        );
      } finally {
        clearInterval(heartbeat);
      }
    }
  }
}
