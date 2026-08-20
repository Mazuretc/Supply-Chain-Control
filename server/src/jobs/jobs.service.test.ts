import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JobsService } from './jobs.service';

test('enqueue is idempotent by job key', async () => {
  let create: Record<string, unknown> | undefined;
  const prisma = {
    job: {
      upsert: async (args: { create: Record<string, unknown> }) => {
        create = args.create;
        return { id: 'job-1', ...args.create };
      },
    },
  };
  const service = new JobsService(prisma as never, { workerId: 'worker-test' });

  await service.enqueue('PROCESS_MAIL', 'process-mail:message-1', { messageId: 'message-1' });

  assert.equal(create?.key, 'process-mail:message-1');
  assert.equal(create?.status, 'PENDING');
});

test('claims one due job with a database processing lock', async () => {
  const sql: string[] = [];
  let updateData: Record<string, unknown> | undefined;
  const prisma = {
    $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        $queryRawUnsafe: async (query: string) => {
          sql.push(query);
          return [{ id: 'job-1', type: 'PROCESS_MAIL', payload: {} }];
        },
        job: {
          update: async ({ data }: { data: Record<string, unknown> }) => {
            updateData = data;
            return {
            id: 'job-1',
            type: 'PROCESS_MAIL',
            payload: {},
            status: 'RUNNING',
            };
          },
        },
      }),
  };
  const service = new JobsService(prisma as never, { workerId: 'worker-test' });

  const claimed = await service.claimNext();

  assert.equal(claimed?.status, 'RUNNING');
  assert.match(sql[0]!, /FOR UPDATE SKIP LOCKED/);
  assert.match(sql[0]!, /"leaseExpiresAt" < CURRENT_TIMESTAMP/);
  assert.equal(updateData?.leaseOwner, 'worker-test');
  assert.ok(updateData?.leaseExpiresAt instanceof Date);
});

test('retries failed jobs with corrected bounded exponential delay', async () => {
  const updates: Record<string, unknown>[] = [];
  const errors: Record<string, unknown>[] = [];
  const prisma = {
    job: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return data;
      },
    },
    processingError: {
      create: async ({ data }: { data: Record<string, unknown> }) => errors.push(data),
    },
  };
  const service = new JobsService(prisma as never, {
    maxAttempts: 3,
    retryBaseMs: 1_000,
    maxRetryMs: 1_500,
  });

  await service.fail(
    { id: 'job-1', attempts: 1, type: 'PROCESS_MAIL' },
    new Error('temporary'),
    new Date('2026-08-17T10:00:00Z'),
  );
  await service.fail(
    { id: 'job-1', attempts: 3, type: 'PROCESS_MAIL' },
    new Error('terminal'),
    new Date('2026-08-17T10:00:00Z'),
  );

  assert.equal(updates[0]?.status, 'PENDING');
  assert.equal((updates[0]?.availableAt as Date).toISOString(), '2026-08-17T10:00:01.000Z');
  assert.equal(updates[1]?.status, 'FAILED');
  assert.equal(errors.length, 1);
});

test('heartbeats owned leases and recovers stale RUNNING jobs on startup', async () => {
  const updates: Array<{ method: string; args: Record<string, unknown> }> = [];
  const prisma = {
    job: {
      updateMany: async (args: Record<string, unknown>) => {
        updates.push({ method: 'updateMany', args });
        return { count: 2 };
      },
    },
  };
  const service = new JobsService(
    prisma as never,
    { leaseMs: 60_000, workerId: 'worker-test' },
  );
  const now = new Date('2026-08-17T10:00:00Z');

  await service.heartbeat('job-1', now);
  const recovered = await service.recoverStale(now);

  assert.equal(recovered, 2);
  assert.equal(
    ((updates[0]?.args.data as Record<string, unknown>).leaseExpiresAt as Date)
      .toISOString(),
    '2026-08-17T10:01:00.000Z',
  );
  assert.equal(
    (updates[1]?.args.where as { status: string }).status,
    'RUNNING',
  );
});
