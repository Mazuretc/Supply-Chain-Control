import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from '@e965/xlsx';
import { ExcelExtractionService } from './excel-extraction.service';
import {
  OpenAiCompatibleExtractionService,
  StructuredExtraction,
} from './openai-compatible-extraction.service';

test('parses modern and legacy Excel workbooks into normalized deadline candidates', async () => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Номер заказа', 'Поле', 'Дата'],
    [' SO-001 ', 'deadline', new Date('2026-09-20T00:00:00.000Z')],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Deadlines');
  const service = new ExcelExtractionService();

  for (const bookType of ['xlsx', 'xls'] as const) {
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType,
      cellDates: true,
    }) as Buffer;
    const { values, errors } = await service.extract(
      buffer,
      `deadlines.${bookType}`,
    );

    assert.deepEqual(values, [
      {
        supplierOrderNo: 'SO-001',
        field: 'deadline',
        value: '2026-09-20',
        evidence: 'Deadlines!2',
      },
    ]);
    assert.deepEqual(errors, []);
  }
});

test('rejects unsupported attachment extensions and forged signatures', async () => {
  const service = new ExcelExtractionService();
  await assert.rejects(
    () => service.extract(Buffer.from('not a workbook'), 'deadlines.csv'),
    /Only \.xlsx and \.xls/,
  );
  await assert.rejects(
    () => service.extract(Buffer.from('not a workbook'), 'deadlines.xlsx'),
    /signature/,
  );
});

test('returns invalid Excel dates as processing issues instead of silently dropping rows', async () => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Номер заказа', 'Дата'],
    ['SO 001', '31.02.2026'],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Deadlines');
  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;

  const result = await new ExcelExtractionService().extract(
    buffer,
    'deadlines.xlsx',
  );

  assert.deepEqual(result.values, []);
  assert.equal(result.errors[0]?.code, 'INVALID_DATE');
  assert.equal(result.errors[0]?.supplierOrderNo, 'SO-001');
  assert.equal(result.errors[0]?.evidence, 'Deadlines!2');
});

test('enforces file, sheet, row and cell complexity limits', async () => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Номер заказа', 'Дата'],
    ['SO-001', '01.09.2026'],
    ['SO-002', '02.09.2026'],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'One');
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Two');
  const content = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;

  await assert.rejects(
    () =>
      new ExcelExtractionService({
        maxFileBytes: content.length - 1,
      }).extract(content, 'limits.xlsx'),
    /file size/,
  );
  await assert.rejects(
    () =>
      new ExcelExtractionService({
        maxSheets: 1,
        maxRows: 100,
        maxCells: 100,
      }).extract(content, 'limits.xlsx'),
    /sheet limit/,
  );
  await assert.rejects(
    () =>
      new ExcelExtractionService({
        maxSheets: 2,
        maxRows: 2,
        maxCells: 100,
      }).extract(content, 'limits.xlsx'),
    /row limit/,
  );
});

test('aborts isolated workbook parsing after the configured timeout', async () => {
  const parser = async () =>
    new Promise<never>(() => {
      // Deliberately never resolves.
    });
  const service = new ExcelExtractionService(
    { parseTimeoutMs: 10 },
    parser,
  );
  const zipSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

  await assert.rejects(
    () => service.extract(zipSignature, 'timeout.xlsx'),
    /timed out/,
  );
});

test('requests and validates strict structured extraction from an OpenAI-compatible endpoint', async () => {
  let request: { url: string; init: RequestInit } | undefined;
  const fetcher = async (url: string, init: RequestInit): Promise<Response> => {
    request = { url, init };
    const extraction: StructuredExtraction = {
      supplierOrderNo: 'SO-001',
      field: 'deadline',
      value: '2026-09-22',
      evidence: 'поставка до 22.09.2026',
      confidence: 0.94,
    };
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify([extraction]) } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const service = new OpenAiCompatibleExtractionService(
    {
      baseUrl: 'https://gpt.internal.example/v1/',
      apiKey: 'server-secret',
      model: 'corporate-model',
    },
    fetcher,
  );

  const result = await service.extract('Заказ SO-001, поставка до 22.09.2026');

  assert.equal(request?.url, 'https://gpt.internal.example/v1/chat/completions');
  assert.equal(
    new Headers(request?.init.headers).get('authorization'),
    'Bearer server-secret',
  );
  const body = JSON.parse(String(request?.init.body)) as Record<string, unknown>;
  assert.equal(body.model, 'corporate-model');
  assert.ok(body.response_format);
  assert.equal(result[0]?.value, '2026-09-22');
});

test('rejects malformed structured model output', async () => {
  const fetcher = async (): Promise<Response> =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"field":"deadline"}' } }],
      }),
      { status: 200 },
    );
  const service = new OpenAiCompatibleExtractionService(
    { baseUrl: 'https://gpt.test/v1', apiKey: 'x', model: 'm' },
    fetcher,
  );

  await assert.rejects(() => service.extract('mail'), /array/);
});
