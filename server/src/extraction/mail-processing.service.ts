import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeadlineResolverService } from './deadline-resolver.service';
import { ExcelExtractionService } from './excel-extraction.service';
import { OpenAiCompatibleExtractionService } from './openai-compatible-extraction.service';
import { canonicalizeSupplierOrder } from './supplier-order';

interface PendingExtraction {
  attachmentId: string | null;
  sourceType: 'EMAIL' | 'EXCEL';
  supplierOrderNo: string;
  field: string;
  value: string;
  evidence: string;
  confidence: number;
}

function dedupeKey(messageId: string, extraction: PendingExtraction): string {
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        extraction.attachmentId,
        extraction.supplierOrderNo,
        extraction.field,
        extraction.value,
        extraction.evidence,
      ]),
    )
    .digest('hex');
  return `mail:${messageId}:${extraction.sourceType}:${fingerprint}`;
}

@Injectable()
export class MailProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gpt: OpenAiCompatibleExtractionService,
    private readonly excel: ExcelExtractionService,
    private readonly resolver: DeadlineResolverService,
  ) {}

  async process(
    messageId: string,
    jobId?: string,
  ): Promise<{ extractions: number }> {
    const db = this.prisma as any;
    const message = await db.mailMessage.findUniqueOrThrow({
      where: { id: messageId },
      include: { attachments: true },
    });
    const pending: PendingExtraction[] = [];

    if (message.body) {
      const values = await this.gpt.extract(message.body);
      for (const value of values) {
        const supplierOrderNo = canonicalizeSupplierOrder(value.supplierOrderNo);
        if (!supplierOrderNo) {
          await db.processingError.create({
            data: {
              code: 'INVALID_ORDER',
              message: 'Extraction returned an invalid supplier order',
              jobId: jobId ?? null,
              messageId: message.id,
              details: { value: value.supplierOrderNo, evidence: value.evidence },
            },
          });
          continue;
        }
        pending.push({
          attachmentId: null,
          sourceType: 'EMAIL' as const,
          ...value,
          supplierOrderNo,
        });
      }
    }

    for (const attachment of message.attachments) {
      if (!attachment.content || !/\.(xlsx|xls)$/i.test(attachment.filename)) continue;
      const batch = await this.excel.extract(
        Buffer.from(attachment.content),
        attachment.filename,
      );
      for (const issue of batch.errors) {
        await db.processingError.create({
          data: {
            code: issue.code,
            message:
              issue.code === 'INVALID_DATE'
                ? 'Excel row contains an invalid date'
                : 'Excel row contains an invalid supplier order',
            jobId: jobId ?? null,
            messageId: message.id,
            details: {
              attachmentId: attachment.id,
              supplierOrderNo: issue.supplierOrderNo,
              evidence: issue.evidence,
              value: issue.value,
            },
          },
        });
      }
      pending.push(
        ...batch.values.map((value) => ({
          attachmentId: attachment.id,
          sourceType: 'EXCEL' as const,
          confidence: 1,
          ...value,
        })),
      );
    }

    for (const value of pending) {
      const key = dedupeKey(message.id, value);
      const extraction = await db.extractionResult.upsert({
        where: { dedupeKey: key },
        create: {
          dedupeKey: key,
          messageId: message.id,
          attachmentId: value.attachmentId,
          sourceType: value.sourceType,
          supplierOrderNo: value.supplierOrderNo,
          field: value.field,
          value: value.value,
          evidence: value.evidence,
          confidence: value.confidence,
        },
        update: {
          evidence: value.evidence,
          confidence: value.confidence,
        },
      });
      await this.resolver.resolve({
        extractionId: extraction.id,
        supplierOrderNo: value.supplierOrderNo,
        field: value.field,
        value: value.value,
        sourceType: value.sourceType,
        sourceTime: message.receivedAt,
        confidence: value.confidence,
        messageId: message.id,
        jobId,
      });
    }

    await db.mailMessage.update({
      where: { id: message.id },
      data: { processedAt: new Date() },
    });
    return { extractions: pending.length };
  }
}
