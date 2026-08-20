import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1_000;

@Injectable()
export class RetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retentionDays = 90,
  ) {}

  async purge(now = new Date()): Promise<{
    cutoff: Date;
    messagesPurged: number;
    attachmentsPurged: number;
  }> {
    const cutoff = new Date(now.getTime() - this.retentionDays * DAY_MS);
    return (this.prisma as any).$transaction(async (tx: any) => {
      const messages = await tx.mailMessage.updateMany({
        where: { receivedAt: { lt: cutoff }, body: { not: null } },
        data: { body: null },
      });
      const attachments = await tx.mailAttachment.updateMany({
        where: {
          message: { receivedAt: { lt: cutoff } },
          content: { not: null },
        },
        data: { content: null },
      });
      await tx.auditLog.create({
        data: {
          action: 'MAIL_CONTENT_RETENTION_PURGE',
          entityType: 'MailMessage',
          metadata: {
            cutoff: cutoff.toISOString(),
            retentionDays: this.retentionDays,
            messagesPurged: messages?.count ?? 0,
            attachmentsPurged: attachments?.count ?? 0,
          },
        },
      });
      return {
        cutoff,
        messagesPurged: messages?.count ?? 0,
        attachmentsPurged: attachments?.count ?? 0,
      };
    });
  }
}
