import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalizeSupplierOrder } from './supplier-order';

export interface DeadlineCandidate {
  extractionId: string;
  supplierOrderNo: string;
  field: string;
  value: string;
  sourceType: 'EMAIL' | 'EXCEL';
  sourceTime: Date;
  confidence: number;
  messageId?: string;
  jobId?: string;
}

const SOURCE_PRIORITY: Record<DeadlineCandidate['sourceType'], number> = {
  EMAIL: 2,
  EXCEL: 1,
};

export function selectWinningCandidate(
  candidates: DeadlineCandidate[],
): DeadlineCandidate | undefined {
  return [...candidates].sort((left, right) => {
    const sourceDifference =
      SOURCE_PRIORITY[right.sourceType] - SOURCE_PRIORITY[left.sourceType];
    return sourceDifference || right.sourceTime.getTime() - left.sourceTime.getTime();
  })[0];
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return date;
}

@Injectable()
export class DeadlineResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minimumConfidence = 0.75,
  ) {}

  async resolve(
    candidate: DeadlineCandidate,
  ): Promise<{ updated: boolean; reason?: string }> {
    const db = this.prisma as any;
    const supplierOrderNo = canonicalizeSupplierOrder(candidate.supplierOrderNo);
    if (!supplierOrderNo) {
      return this.reject(candidate, 'INVALID_ORDER', 'Invalid supplier order');
    }
    const order = await db.supplierOrder.findUnique({
      where: { supplierOrderNumber: supplierOrderNo },
    });
    if (!order) return this.reject(candidate, 'UNKNOWN_ORDER', 'Unknown supplier order');

    const date = parseIsoDate(candidate.value);
    if (!date) return this.reject(candidate, 'INVALID_DATE', 'Invalid ISO calendar date');
    if (candidate.confidence < this.minimumConfidence) {
      return this.reject(
        candidate,
        'LOW_CONFIDENCE',
        `Confidence is below ${this.minimumConfidence}`,
      );
    }
    if (!['deadline', 'productionPlan'].includes(candidate.field)) {
      return this.reject(candidate, 'UNKNOWN_FIELD', 'Unsupported deadline field');
    }

    const updated = await db.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `${order.id}:${candidate.field}`,
      );
      const lockedOrder = await tx.supplierOrder.findUniqueOrThrow({
        where: { id: order.id },
      });
      const current = await tx.deadlineValue.findFirst({
        where: {
          supplierOrderId: order.id,
          field: candidate.field,
          isCurrent: true,
        },
      });
      if (current) {
        const existing: DeadlineCandidate = {
          extractionId: current.extractionId ?? current.id,
          supplierOrderNo,
          field: candidate.field,
          value: new Date(current.value).toISOString().slice(0, 10),
          sourceType: current.sourceType,
          sourceTime: current.sourceTime,
          confidence: 1,
        };
        if (selectWinningCandidate([existing, candidate]) === existing) {
          return false;
        }
      }
      await tx.deadlineValue.updateMany({
        where: {
          supplierOrderId: order.id,
          field: candidate.field,
          isCurrent: true,
        },
        data: { isCurrent: false },
      });
      await tx.deadlineValue.create({
        data: {
          supplierOrderId: order.id,
          field: candidate.field,
          value: date,
          sourceType: candidate.sourceType,
          sourceTime: candidate.sourceTime,
          extractionId: candidate.extractionId,
          isCurrent: true,
        },
      });
      await tx.supplierOrder.update({
        where: { id: order.id },
        data: { [candidate.field]: date },
      });
      await tx.deadlineChange.create({
        data: {
          supplierOrderId: order.id,
          field: candidate.field,
          oldValue: lockedOrder[candidate.field] ?? null,
          newValue: date,
          sourceType: candidate.sourceType,
          sourceReference: candidate.extractionId,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'DEADLINE_RESOLVED',
          entityType: 'SupplierOrder',
          entityId: order.id,
          metadata: {
            field: candidate.field,
            sourceType: candidate.sourceType,
            extractionId: candidate.extractionId,
            oldValue: lockedOrder[candidate.field]?.toISOString?.() ?? null,
            newValue: candidate.value,
          },
        },
      });
      return true;
    });
    return updated
      ? { updated: true }
      : { updated: false, reason: 'LOWER_PRIORITY' };
  }

  private async reject(
    candidate: DeadlineCandidate,
    code: string,
    message: string,
  ): Promise<{ updated: false; reason: string }> {
    const db = this.prisma as any;
    await db.processingError.create({
      data: {
        code,
        message,
        jobId: candidate.jobId ?? null,
        messageId: candidate.messageId ?? null,
        details: {
          supplierOrderNo: candidate.supplierOrderNo,
          field: candidate.field,
          value: candidate.value,
          confidence: candidate.confidence,
          extractionId: candidate.extractionId,
        },
      },
    });
    return { updated: false, reason: code };
  }
}
