import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contentHash,
  normalizeMessageId,
} from './mail-deduplication';
import { MailIngestionService } from './mail-ingestion.service';

test('normalizes Message-ID and hashes identical raw messages deterministically', () => {
  assert.equal(normalizeMessageId(' <ABC@Example.COM> '), 'abc@example.com');
  assert.equal(normalizeMessageId(undefined), null);
  assert.equal(contentHash(Buffer.from('same')), contentHash(Buffer.from('same')));
  assert.notEqual(contentHash(Buffer.from('same')), contentHash(Buffer.from('other')));
});

test('deduplicates by normalized Message-ID before writing a message', async () => {
  let creates = 0;
  let recoveredJobs = 0;
  const prisma = {
    mailMessage: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        'messageId' in where ? { id: 'existing' } : null,
      create: async () => {
        creates += 1;
        return { id: 'created' };
      },
    },
    job: {
      upsert: async () => {
        recoveredJobs += 1;
      },
    },
  };
  const service = new MailIngestionService(prisma as never);

  const result = await service.persist({
    mailAccountId: 'account-1',
    messageId: '<DUP@example.test>',
    raw: Buffer.from('raw source'),
    subject: 'duplicate',
    sender: 'supplier@example.test',
    receivedAt: new Date('2026-08-17T09:00:00Z'),
    body: 'body',
    attachments: [],
  });

  assert.deepEqual(result, { id: 'existing', duplicate: true });
  assert.equal(creates, 0);
  assert.equal(recoveredJobs, 1);
});

test('deduplicates by content hash when Message-ID is absent or changed', async () => {
  const seenWhere: Record<string, unknown>[] = [];
  const prisma = {
    mailMessage: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        seenWhere.push(where);
        return 'contentHash' in where ? { id: 'same-content' } : null;
      },
      create: async () => {
        throw new Error('must not create');
      },
    },
    job: { upsert: async () => undefined },
  };
  const service = new MailIngestionService(prisma as never);
  const raw = Buffer.from('same raw message');

  const result = await service.persist({
    mailAccountId: 'account-1',
    messageId: '<new-id@example.test>',
    raw,
    receivedAt: new Date(),
    attachments: [],
  });

  assert.equal(result.id, 'same-content');
  assert.equal(result.duplicate, true);
  assert.ok(seenWhere.some((where) => 'contentHash' in where));
});

test('persists attachment hashes and queues one idempotent processing job', async () => {
  let createdMessage: Record<string, unknown> | undefined;
  let queuedJob: Record<string, unknown> | undefined;
  const prisma = {
    $transaction: async (
      work: (tx: {
        mailMessage: unknown;
        job: unknown;
      }) => Promise<unknown>,
    ) =>
      work({
        mailMessage: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            createdMessage = data;
            return { id: 'message-1' };
          },
        },
        job: {
          upsert: async ({ create }: { create: Record<string, unknown> }) => {
            queuedJob = create;
            return create;
          },
        },
      }),
    mailMessage: {
      findFirst: async () => null,
    },
    job: {
      upsert: async () => {
        throw new Error('job must be enqueued in the message transaction');
      },
    },
  };
  const service = new MailIngestionService(prisma as never);

  const result = await service.persist({
    mailAccountId: 'account-1',
    messageId: '<new@example.test>',
    raw: Buffer.from('raw'),
    receivedAt: new Date('2026-08-17T09:00:00Z'),
    attachments: [
      {
        filename: 'dates.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      },
    ],
  });

  assert.equal(result.duplicate, false);
  const attachments = (createdMessage?.attachments as { create: unknown[] }).create;
  assert.equal(attachments.length, 1);
  assert.equal(
    (attachments[0] as Record<string, unknown>).contentHash,
    contentHash(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  );
  assert.equal(queuedJob?.key, 'process-mail:message-1');
});

test('enforces raw, attachment count, per-file and aggregate byte limits', async () => {
  const service = new MailIngestionService(
    {} as never,
    {
      maxRawBytes: 5,
      maxAttachments: 1,
      maxAttachmentBytes: 3,
      maxAggregateAttachmentBytes: 4,
    },
  );
  const base = {
    mailAccountId: 'account-1',
    receivedAt: new Date(),
    attachments: [],
  };

  await assert.rejects(
    () => service.persist({ ...base, raw: Buffer.alloc(6) }),
    /raw message size/,
  );
  await assert.rejects(
    () =>
      service.persist({
        ...base,
        raw: Buffer.alloc(1),
        attachments: [
          { filename: 'a.txt', contentType: 'text/plain', content: Buffer.alloc(1) },
          { filename: 'b.txt', contentType: 'text/plain', content: Buffer.alloc(1) },
        ],
      }),
    /attachment count/,
  );
  await assert.rejects(
    () =>
      service.persist({
        ...base,
        raw: Buffer.alloc(1),
        attachments: [
          { filename: 'a.txt', contentType: 'text/plain', content: Buffer.alloc(4) },
        ],
      }),
    /per-file/,
  );
  const aggregateService = new MailIngestionService(
    {} as never,
    {
      maxRawBytes: 100,
      maxAttachments: 2,
      maxAttachmentBytes: 3,
      maxAggregateAttachmentBytes: 4,
    },
  );
  await assert.rejects(
    () =>
      aggregateService.persist({
        ...base,
        raw: Buffer.alloc(1),
        attachments: [
          { filename: 'a.txt', contentType: 'text/plain', content: Buffer.alloc(3) },
          { filename: 'b.txt', contentType: 'text/plain', content: Buffer.alloc(2) },
        ],
      }),
    /aggregate/,
  );
});

test('rejects workbook MIME and signature mismatches', async () => {
  const service = new MailIngestionService({} as never);
  const base = {
    mailAccountId: 'account-1',
    receivedAt: new Date(),
    raw: Buffer.alloc(1),
  };

  await assert.rejects(
    () =>
      service.persist({
        ...base,
        attachments: [
          {
            filename: 'dates.xlsx',
            contentType: 'text/plain',
            content: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
          },
        ],
      }),
    /MIME/,
  );
  await assert.rejects(
    () =>
      service.persist({
        ...base,
        attachments: [
          {
            filename: 'dates.xls',
            contentType: 'application/vnd.ms-excel',
            content: Buffer.from('not ole'),
          },
        ],
      }),
    /signature/,
  );
});
