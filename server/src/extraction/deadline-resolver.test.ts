import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DeadlineCandidate,
  DeadlineResolverService,
  selectWinningCandidate,
} from './deadline-resolver.service';

const candidate = (
  sourceType: 'EMAIL' | 'EXCEL',
  value: string,
  sourceTime: string,
): DeadlineCandidate => ({
  extractionId: `${sourceType}-${value}`,
  supplierOrderNo: 'SO-001',
  field: 'deadline',
  value,
  sourceType,
  sourceTime: new Date(sourceTime),
  confidence: 0.9,
});

test('email text always outranks newer Excel values', () => {
  const winner = selectWinningCandidate([
    candidate('EMAIL', '2026-09-10', '2026-08-01T00:00:00Z'),
    candidate('EXCEL', '2026-10-20', '2026-08-17T00:00:00Z'),
  ]);
  assert.equal(winner?.sourceType, 'EMAIL');
  assert.equal(winner?.value, '2026-09-10');
});

test('uses newest message within the same source type', () => {
  const winner = selectWinningCandidate([
    candidate('EMAIL', '2026-09-10', '2026-08-01T00:00:00Z'),
    candidate('EMAIL', '2026-09-20', '2026-08-17T00:00:00Z'),
  ]);
  assert.equal(winner?.value, '2026-09-20');
});

test('records validation error and does not update unknown orders', async () => {
  let transactionCalls = 0;
  const errors: Record<string, unknown>[] = [];
  const prisma = {
    supplierOrder: { findUnique: async () => null },
    processingError: {
      create: async ({ data }: { data: Record<string, unknown> }) => errors.push(data),
    },
    $transaction: async () => {
      transactionCalls += 1;
    },
  };
  const service = new DeadlineResolverService(prisma as never);

  const result = await service.resolve(candidate('EMAIL', '2026-09-10', '2026-08-17T00:00:00Z'));

  assert.equal(result.updated, false);
  assert.equal(errors[0]?.code, 'UNKNOWN_ORDER');
  assert.equal(transactionCalls, 0);
});

test('canonicalizes supplier order before database resolution', async () => {
  let orderNumber: string | undefined;
  const prisma = {
    supplierOrder: {
      findUnique: async ({ where }: { where: { supplierOrderNumber: string } }) => {
        orderNumber = where.supplierOrderNumber;
        return null;
      },
    },
    processingError: { create: async () => undefined },
  };
  const service = new DeadlineResolverService(prisma as never);

  await service.resolve({
    ...candidate('EMAIL', '2026-09-10', '2026-08-17T00:00:00Z'),
    supplierOrderNo: ' so 001 ',
  });

  assert.equal(orderNumber, 'SO-001');
});

test('records invalid-date and low-confidence errors without updates', async () => {
  const errors: Record<string, unknown>[] = [];
  const prisma = {
    supplierOrder: { findUnique: async () => ({ id: 'order-1', deadline: null }) },
    processingError: {
      create: async ({ data }: { data: Record<string, unknown> }) => errors.push(data),
    },
    $transaction: async () => {
      throw new Error('must not transact');
    },
  };
  const service = new DeadlineResolverService(prisma as never, 0.75);
  const invalid = candidate('EMAIL', '2026-02-31', '2026-08-17T00:00:00Z');
  const lowConfidence = {
    ...candidate('EMAIL', '2026-09-10', '2026-08-17T00:00:00Z'),
    confidence: 0.5,
  };

  assert.equal((await service.resolve(invalid)).updated, false);
  assert.equal((await service.resolve(lowConfidence)).updated, false);
  assert.deepEqual(errors.map((error) => error.code), [
    'INVALID_DATE',
    'LOW_CONFIDENCE',
  ]);
});

test('atomically replaces current value, updates order and writes audit history', async () => {
  const operations: string[] = [];
  let changeData: Record<string, unknown> | undefined;
  const tx = {
    $queryRawUnsafe: async () => operations.push('lock'),
    supplierOrder: {
      findUniqueOrThrow: async () => {
        operations.push('reread-order');
        return {
          id: 'order-1',
          deadline: new Date('2026-09-05T00:00:00Z'),
        };
      },
      update: async () => operations.push('update-order'),
    },
    deadlineValue: {
      findFirst: async () => {
        operations.push('find-current');
        return null;
      },
      updateMany: async () => operations.push('unset-current'),
      create: async () => operations.push('create-current'),
    },
    deadlineChange: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        changeData = data;
        operations.push('deadline-change');
      },
    },
    auditLog: {
      create: async () => operations.push('audit'),
    },
  };
  const prisma = {
    supplierOrder: {
      findUnique: async () => ({
        id: 'order-1',
        supplierOrderNumber: 'SO-001',
        deadline: new Date('2026-09-01T00:00:00Z'),
      }),
    },
    processingError: { create: async () => undefined },
    $transaction: async (work: (client: typeof tx) => Promise<void>) => work(tx),
  };
  const service = new DeadlineResolverService(prisma as never);

  const result = await service.resolve(candidate('EMAIL', '2026-09-20', '2026-08-17T00:00:00Z'));

  assert.equal(result.updated, true);
  assert.deepEqual(operations, [
    'lock',
    'reread-order',
    'find-current',
    'unset-current',
    'create-current',
    'update-order',
    'deadline-change',
    'audit',
  ]);
  assert.equal(
    (changeData?.oldValue as Date).toISOString(),
    '2026-09-05T00:00:00.000Z',
  );
});
