import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RetentionService } from './retention.service';

test('deletes 90-day-old bodies and binaries while preserving records and metadata', async () => {
  const calls: Array<{ model: string; args: Record<string, unknown> }> = [];
  const tx = {
    mailMessage: {
      updateMany: async (args: Record<string, unknown>) =>
        calls.push({ model: 'message', args }),
    },
    mailAttachment: {
      updateMany: async (args: Record<string, unknown>) =>
        calls.push({ model: 'attachment', args }),
    },
    auditLog: {
      create: async (args: Record<string, unknown>) =>
        calls.push({ model: 'audit', args }),
    },
  };
  const prisma = {
    $transaction: async (work: (client: typeof tx) => Promise<void>) => work(tx),
  };
  const service = new RetentionService(prisma as never, 90);

  const result = await service.purge(new Date('2026-08-17T12:00:00Z'));

  assert.equal(result.cutoff.toISOString(), '2026-05-19T12:00:00.000Z');
  assert.deepEqual(calls.map((call) => call.model), [
    'message',
    'attachment',
    'audit',
  ]);
  assert.deepEqual(
    (calls[0]?.args.data as Record<string, unknown>),
    { body: null },
  );
  assert.deepEqual(
    (calls[1]?.args.data as Record<string, unknown>),
    { content: null },
  );
  assert.equal(calls.some((call) => call.model === 'deadlineValue'), false);
});
