import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface ClaimedJob {
  id: string;
  type: string;
  payload: unknown;
  status: string;
  attempts?: number;
}

export interface FailedJob {
  id: string;
  type: string;
  attempts: number;
}

@Injectable()
export class JobsService {
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly maxRetryMs: number;
  private readonly leaseMs: number;
  private readonly workerId: string;

  constructor(
    private readonly prisma: PrismaService,
    options: {
      maxAttempts?: number;
      retryBaseMs?: number;
      maxRetryMs?: number;
      leaseMs?: number;
      workerId?: string;
    } = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.retryBaseMs = options.retryBaseMs ?? 30_000;
    this.maxRetryMs = options.maxRetryMs ?? 30 * 60_000;
    this.leaseMs = options.leaseMs ?? 5 * 60_000;
    this.workerId = options.workerId ?? `${process.pid}:${randomUUID()}`;
  }

  enqueue(type: string, key: string, payload: object): Promise<unknown> {
    return (this.prisma as any).job.upsert({
      where: { key },
      create: { type, key, payload, status: 'PENDING' },
      update: {},
    });
  }

  claimNext(): Promise<ClaimedJob | null> {
    return (this.prisma as any).$transaction(async (tx: any) => {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT "id", "type", "payload"
         FROM "Job"
         WHERE (
           ("status" = 'PENDING' AND "availableAt" <= CURRENT_TIMESTAMP)
           OR ("status" = 'RUNNING' AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" < CURRENT_TIMESTAMP))
         )
         ORDER BY "availableAt", "createdAt"
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
      )) as Array<{ id: string; type: string; payload: unknown }>;
      const job = rows[0];
      if (!job) return null;
      return tx.job.update({
        where: { id: job.id },
        data: {
          status: 'RUNNING',
          attempts: { increment: 1 },
          startedAt: new Date(),
          heartbeatAt: new Date(),
          leaseExpiresAt: new Date(Date.now() + this.leaseMs),
          leaseOwner: this.workerId,
          finishedAt: null,
          lastError: null,
        },
      });
    });
  }

  async succeed(jobId: string): Promise<void> {
    await (this.prisma as any).job.update({
      where: { id: jobId },
      data: {
        status: 'SUCCEEDED',
        finishedAt: new Date(),
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  }

  async heartbeat(jobId: string, now = new Date()): Promise<boolean> {
    const result = await (this.prisma as any).job.updateMany({
      where: { id: jobId, status: 'RUNNING', leaseOwner: this.workerId },
      data: {
        heartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
      },
    });
    return result.count === 1;
  }

  async recoverStale(now = new Date()): Promise<number> {
    const result = await (this.prisma as any).job.updateMany({
      where: {
        status: 'RUNNING',
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
      },
      data: {
        status: 'PENDING',
        availableAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        lastError: 'Recovered stale RUNNING lease at worker startup',
      },
    });
    return result.count;
  }

  async fail(job: FailedJob, error: unknown, now = new Date()): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    if (job.attempts < this.maxAttempts) {
      const delay = Math.min(
        this.maxRetryMs,
        this.retryBaseMs * 2 ** Math.max(0, job.attempts - 1),
      );
      await (this.prisma as any).job.update({
        where: { id: job.id },
        data: {
          status: 'PENDING',
          availableAt: new Date(now.getTime() + delay),
          finishedAt: null,
          lastError: message,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      return;
    }
    await (this.prisma as any).job.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        finishedAt: now,
        lastError: message,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    await (this.prisma as any).processingError.create({
      data: {
        code: `${job.type}_FAILED`,
        message,
        jobId: job.id,
        details: { attempts: job.attempts },
      },
    });
  }
}
