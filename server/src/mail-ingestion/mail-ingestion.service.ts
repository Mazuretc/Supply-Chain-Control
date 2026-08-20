import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { contentHash, normalizeMessageId } from './mail-deduplication';

export interface IncomingAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface IncomingMail {
  mailAccountId: string;
  messageId?: string | null;
  raw: Buffer;
  subject?: string | null;
  sender?: string | null;
  receivedAt: Date;
  body?: string | null;
  attachments: IncomingAttachment[];
}

export interface MailLimits {
  maxRawBytes: number;
  maxAttachments: number;
  maxAttachmentBytes: number;
  maxAggregateAttachmentBytes: number;
}

const DEFAULT_MAIL_LIMITS: MailLimits = {
  maxRawBytes: 25 * 1024 * 1024,
  maxAttachments: 20,
  maxAttachmentBytes: 10 * 1024 * 1024,
  maxAggregateAttachmentBytes: 20 * 1024 * 1024,
};

function validateWorkbookAttachment(attachment: IncomingAttachment): void {
  const mime = attachment.contentType.toLowerCase().split(';', 1)[0]?.trim();
  const isXlsx = /\.xlsx$/i.test(attachment.filename);
  const isXls = /\.xls$/i.test(attachment.filename);
  if (!isXlsx && !isXls) return;
  const allowed = isXlsx
    ? [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream',
      ]
    : ['application/vnd.ms-excel', 'application/octet-stream'];
  if (!mime || !allowed.includes(mime)) {
    throw new Error(`Workbook MIME type is not allowed: ${attachment.contentType}`);
  }
  const signatureMatches = isXlsx
    ? attachment.content.length >= 4 &&
      attachment.content[0] === 0x50 &&
      attachment.content[1] === 0x4b &&
      [0x03, 0x05, 0x07].includes(attachment.content[2]!)
    : [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
        (byte, index) => attachment.content[index] === byte,
      );
  if (!signatureMatches) {
    throw new Error(`Workbook signature does not match ${attachment.filename}`);
  }
}

@Injectable()
export class MailIngestionService {
  private readonly limits: MailLimits;

  constructor(
    private readonly prisma: PrismaService,
    limits: Partial<MailLimits> = {},
  ) {
    this.limits = { ...DEFAULT_MAIL_LIMITS, ...limits };
  }

  async persist(mail: IncomingMail): Promise<{ id: string; duplicate: boolean }> {
    this.validateLimits(mail);
    const messageId = normalizeMessageId(mail.messageId);
    const hash = contentHash(mail.raw);

    if (messageId) {
      const duplicateById = await this.prisma.mailMessage.findFirst({
        where: { mailAccountId: mail.mailAccountId, messageId },
        select: { id: true },
      });
      if (duplicateById) {
        await this.ensureProcessingJob(this.prisma, duplicateById.id);
        return { id: duplicateById.id, duplicate: true };
      }
    }

    const duplicateByHash = await this.prisma.mailMessage.findFirst({
      where: { mailAccountId: mail.mailAccountId, contentHash: hash },
      select: { id: true },
    });
    if (duplicateByHash) {
      await this.ensureProcessingJob(this.prisma, duplicateByHash.id);
      return { id: duplicateByHash.id, duplicate: true };
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mailMessage.create({
        data: {
          mailAccountId: mail.mailAccountId,
          messageId,
          contentHash: hash,
          subject: mail.subject ?? null,
          sender: mail.sender ?? null,
          receivedAt: mail.receivedAt,
          body: mail.body ?? null,
          attachments: {
            create: mail.attachments.map((attachment) => ({
              filename: attachment.filename,
              contentType: attachment.contentType,
              contentHash: contentHash(attachment.content),
              content: new Uint8Array(attachment.content),
            })),
          },
        },
        select: { id: true },
      });
      await this.ensureProcessingJob(tx, created.id);
      return created;
    });

    return { id: message.id, duplicate: false };
  }

  private validateLimits(mail: IncomingMail): void {
    if (mail.raw.length > this.limits.maxRawBytes) {
      throw new Error('Mail raw message size limit exceeded');
    }
    if (mail.attachments.length > this.limits.maxAttachments) {
      throw new Error('Mail attachment count limit exceeded');
    }
    let aggregate = 0;
    for (const attachment of mail.attachments) {
      if (attachment.content.length > this.limits.maxAttachmentBytes) {
        throw new Error('Mail attachment per-file size limit exceeded');
      }
      aggregate += attachment.content.length;
      if (aggregate > this.limits.maxAggregateAttachmentBytes) {
        throw new Error('Mail attachment aggregate size limit exceeded');
      }
      validateWorkbookAttachment(attachment);
    }
  }

  private ensureProcessingJob(
    client: Pick<PrismaService, 'job'>,
    messageId: string,
  ): Promise<unknown> {
    return client.job.upsert({
      where: { key: `process-mail:${messageId}` },
      create: {
        type: 'PROCESS_MAIL',
        key: `process-mail:${messageId}`,
        status: 'PENDING',
        payload: { messageId },
      },
      update: {},
    });
  }
}
