import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MailProcessingService } from './mail-processing.service';

test('extracts text and Excel, persists idempotently and resolves both candidates', async () => {
  const upserts: Record<string, unknown>[] = [];
  const resolved: Record<string, unknown>[] = [];
  let processedAt: Date | undefined;
  const message = {
    id: 'message-1',
    receivedAt: new Date('2026-08-17T10:00:00Z'),
    body: 'SO-001 deadline 20.09.2026',
    attachments: [
      {
        id: 'attachment-1',
        filename: 'dates.xlsx',
        content: Buffer.from('workbook'),
      },
      {
        id: 'attachment-2',
        filename: 'notes.txt',
        content: Buffer.from('ignore'),
      },
    ],
  };
  const prisma = {
    mailMessage: {
      findUniqueOrThrow: async () => message,
      update: async ({ data }: { data: { processedAt: Date } }) => {
        processedAt = data.processedAt;
      },
    },
    extractionResult: {
      upsert: async (args: Record<string, unknown>) => {
        upserts.push(args);
        return {
          id: `extraction-${upserts.length}`,
          ...(args.create as Record<string, unknown>),
        };
      },
    },
    processingError: {
      create: async () => undefined,
    },
  };
  const gpt = {
    extract: async () => [
      {
        supplierOrderNo: 'SO-001',
        field: 'deadline',
        value: '2026-09-20',
        evidence: 'deadline 20.09.2026',
        confidence: 0.95,
      },
    ],
  };
  const excel = {
    extract: async () => ({
      values: [
        {
          supplierOrderNo: 'SO-001',
          field: 'deadline',
          value: '2026-10-01',
          evidence: 'Sheet1!2',
        },
      ],
      errors: [],
    }),
  };
  const resolver = {
    resolve: async (candidate: Record<string, unknown>) => resolved.push(candidate),
  };
  const service = new MailProcessingService(
    prisma as never,
    gpt as never,
    excel as never,
    resolver as never,
  );

  const result = await service.process('message-1', 'job-1');

  assert.equal(result.extractions, 2);
  assert.equal(upserts.length, 2);
  assert.equal(resolved[0]?.sourceType, 'EMAIL');
  assert.equal(resolved[1]?.sourceType, 'EXCEL');
  assert.ok(processedAt);
  assert.match(
    String((upserts[0]?.where as Record<string, unknown>).dedupeKey),
    /^mail:message-1:EMAIL:/,
  );
});

test('does not call GPT when retained message body has already been purged', async () => {
  let gptCalls = 0;
  const prisma = {
    mailMessage: {
      findUniqueOrThrow: async () => ({
        id: 'message-old',
        receivedAt: new Date('2026-01-01T00:00:00Z'),
        body: null,
        attachments: [],
      }),
      update: async () => undefined,
    },
    extractionResult: { upsert: async () => undefined },
  };
  const service = new MailProcessingService(
    prisma as never,
    { extract: async () => { gptCalls += 1; return []; } } as never,
    { extract: async () => ({ values: [], errors: [] }) } as never,
    { resolve: async () => undefined } as never,
  );

  await service.process('message-old', 'job-1');

  assert.equal(gptCalls, 0);
});

test('persists INVALID_DATE errors returned for bad Excel rows', async () => {
  const errors: Record<string, unknown>[] = [];
  const prisma = {
    mailMessage: {
      findUniqueOrThrow: async () => ({
        id: 'message-1',
        receivedAt: new Date('2026-08-17T10:00:00Z'),
        body: null,
        attachments: [
          {
            id: 'attachment-1',
            filename: 'dates.xlsx',
            content: Buffer.from('workbook'),
          },
        ],
      }),
      update: async () => undefined,
    },
    extractionResult: { upsert: async () => undefined },
    processingError: {
      create: async ({ data }: { data: Record<string, unknown> }) =>
        errors.push(data),
    },
  };
  const service = new MailProcessingService(
    prisma as never,
    { extract: async () => [] } as never,
    {
      extract: async () => ({
        values: [],
        errors: [
          {
            code: 'INVALID_DATE',
            supplierOrderNo: 'SO-001',
            evidence: 'Sheet1!2',
            value: '31.02.2026',
          },
        ],
      }),
    } as never,
    { resolve: async () => undefined } as never,
  );

  await service.process('message-1', 'job-1');

  assert.equal(errors[0]?.code, 'INVALID_DATE');
  assert.equal(errors[0]?.jobId, 'job-1');
  assert.equal(errors[0]?.messageId, 'message-1');
});
