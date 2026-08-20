import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MailWorkerService } from './mail-worker.service';

test('polls enabled accounts and completes queued mail processing jobs', async () => {
  const events: string[] = [];
  let claims = 0;
  const account = { id: 'account-1' };
  const prisma = {
    mailAccount: {
      findMany: async () => [account],
      findUniqueOrThrow: async () => account,
      update: async () => events.push('polled-at'),
    },
  };
  const jobs = {
    enqueue: async (type: string) => events.push(`enqueued:${type}`),
    claimNext: async () => {
      claims += 1;
      return claims === 1
        ? {
            id: 'job-1',
            type: 'POLL_MAIL_ACCOUNT',
            payload: { accountId: 'account-1' },
            attempts: 1,
          }
        : null;
    },
    heartbeat: async () => {
      events.push('heartbeat');
      return true;
    },
    succeed: async () => events.push('succeeded'),
    fail: async () => events.push('failed'),
  };
  const service = new MailWorkerService(
    prisma as never,
    { pollAccount: async () => events.push('polled') } as never,
    jobs as never,
    { process: async () => events.push('processed') } as never,
    { purge: async () => events.push('retained') } as never,
  );

  await service.runOnce();

  assert.deepEqual(events, [
    'enqueued:POLL_MAIL_ACCOUNT',
    'enqueued:RETENTION',
    'heartbeat',
    'polled',
    'polled-at',
    'succeeded',
  ]);
});

test('reports failed processing through retry-aware jobs service', async () => {
  const failures: unknown[] = [];
  let claims = 0;
  const job = {
    id: 'job-1',
    type: 'POLL_MAIL_ACCOUNT',
    payload: { accountId: 'account-1' },
    attempts: 2,
  };
  const service = new MailWorkerService(
    {
      mailAccount: {
        findMany: async () => [],
        findUniqueOrThrow: async () => ({ id: 'account-1' }),
        update: async () => undefined,
      },
    } as never,
    { pollAccount: async () => { throw new Error('GPT unavailable'); } } as never,
    {
      enqueue: async () => undefined,
      claimNext: async () => (++claims === 1 ? job : null),
      heartbeat: async () => true,
      succeed: async () => undefined,
      fail: async (_job: unknown, error: unknown) => failures.push(error),
    } as never,
    { process: async () => undefined } as never,
    { purge: async () => undefined } as never,
  );

  await service.runOnce();

  assert.equal(failures.length, 1);
  assert.match(String(failures[0]), /GPT unavailable/);
});

test('recovers stale RUNNING jobs when the worker starts', async () => {
  let recovered = 0;
  const service = new MailWorkerService(
    {} as never,
    {} as never,
    {
      recoverStale: async () => {
        recovered += 1;
        return 2;
      },
    } as never,
    {} as never,
    {} as never,
  );

  await service.onModuleInit();

  assert.equal(recovered, 1);
});
