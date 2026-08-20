import { Injectable } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import * as XLSX from '@e965/xlsx';
import { canonicalizeSupplierOrder } from './supplier-order';

export interface ExcelExtraction {
  supplierOrderNo: string;
  field: string;
  value: string;
  evidence: string;
}

export interface ExcelExtractionError {
  code: 'INVALID_DATE' | 'INVALID_ORDER';
  supplierOrderNo: string | null;
  evidence: string;
  value: string;
}

export interface ExcelExtractionBatch {
  values: ExcelExtraction[];
  errors: ExcelExtractionError[];
}

export interface WorkbookLimits {
  maxFileBytes: number;
  maxSheets: number;
  maxRows: number;
  maxCells: number;
  parseTimeoutMs: number;
  workerMemoryMb: number;
}

interface ParsedSheet {
  name: string;
  rows: unknown[][];
}

type WorkbookParser = (
  content: Buffer,
  limits: WorkbookLimits,
) => Promise<ParsedSheet[]>;

const DEFAULT_LIMITS: WorkbookLimits = {
  maxFileBytes: 10 * 1024 * 1024,
  maxSheets: 10,
  maxRows: 10_000,
  maxCells: 200_000,
  parseTimeoutMs: 10_000,
  workerMemoryMb: 96,
};

const ORDER_HEADERS = ['номер заказа', 'заказ', 'supplier order', 'order'];
const FIELD_HEADERS = ['поле', 'field'];
const DATE_HEADERS = ['дата', 'срок', 'date', 'deadline'];

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('ru-RU');
}

function findColumn(headers: unknown[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function validIsoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function formatDate(value: unknown): string | null {
  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return validIsoDate(`${parsed.y.toString().padStart(4, '0')}-${parsed.m
        .toString()
        .padStart(2, '0')}-${parsed.d.toString().padStart(2, '0')}`);
    }
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (iso) return validIsoDate(trimmed);
    const local = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(trimmed);
    if (local) return validIsoDate(`${local[3]}-${local[2]}-${local[1]}`);
  }
  if (!date || Number.isNaN(date.getTime())) return null;
  return validIsoDate([
    date.getFullYear().toString().padStart(4, '0'),
    (date.getMonth() + 1).toString().padStart(2, '0'),
    date.getDate().toString().padStart(2, '0'),
  ].join('-'));
}

const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const XLSX = require('@e965/xlsx');
try {
  const workbook = XLSX.read(Buffer.from(workerData.content), {
    type: 'buffer',
    cellDates: false,
    dense: true,
    WTF: false
  });
  const limits = workerData.limits;
  if (workbook.SheetNames.length > limits.maxSheets) throw new Error('Workbook sheet limit exceeded');
  let totalCells = 0;
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const range = sheet && sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
    const rowCount = range ? range.e.r - range.s.r + 1 : 0;
    const columnCount = range ? range.e.c - range.s.c + 1 : 0;
    if (rowCount > limits.maxRows) throw new Error('Workbook row limit exceeded');
    totalCells += rowCount * columnCount;
    if (totalCells > limits.maxCells) throw new Error('Workbook cell complexity limit exceeded');
    return {
      name,
      rows: XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })
    };
  });
  parentPort.postMessage({ sheets });
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : String(error) });
}
`;

function parseWorkbookIsolated(
  content: Buffer,
  limits: WorkbookLimits,
): Promise<ParsedSheet[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { content, limits },
      resourceLimits: {
        maxOldGenerationSizeMb: limits.workerMemoryMb,
        stackSizeMb: 4,
      },
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Workbook parsing timed out'));
    }, limits.parseTimeoutMs);
    worker.once('message', (message: { sheets?: ParsedSheet[]; error?: string }) => {
      clearTimeout(timer);
      void worker.terminate();
      if (message.error) reject(new Error(message.error));
      else resolve(message.sheets ?? []);
    });
    worker.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timer);
        reject(new Error(`Workbook parser worker exited with code ${code}`));
      }
    });
  });
}

function hasExpectedSignature(content: Buffer, filename: string): boolean {
  if (/\.xlsx$/i.test(filename)) {
    return (
      content.length >= 4 &&
      content[0] === 0x50 &&
      content[1] === 0x4b &&
      [0x03, 0x05, 0x07].includes(content[2]!)
    );
  }
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return content.length >= ole.length && ole.every((byte, index) => content[index] === byte);
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Workbook parsing timed out')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

@Injectable()
export class ExcelExtractionService {
  private readonly limits: WorkbookLimits;

  constructor(
    limits: Partial<WorkbookLimits> = {},
    private readonly parser: WorkbookParser = parseWorkbookIsolated,
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  async extract(content: Buffer, filename: string): Promise<ExcelExtractionBatch> {
    if (!/\.(xlsx|xls)$/i.test(filename)) {
      throw new Error('Only .xlsx and .xls attachments are supported');
    }
    if (content.length > this.limits.maxFileBytes) {
      throw new Error('Workbook file size limit exceeded');
    }
    if (!hasExpectedSignature(content, filename)) {
      throw new Error('Workbook signature does not match its extension');
    }
    const sheets = await withTimeout(
      this.parser(content, this.limits),
      this.limits.parseTimeoutMs,
    );
    const results: ExcelExtraction[] = [];
    const errors: ExcelExtractionError[] = [];

    for (const { name: sheetName, rows } of sheets) {
      const headers = rows[0] ?? [];
      const orderColumn = findColumn(headers, ORDER_HEADERS);
      const fieldColumn = findColumn(headers, FIELD_HEADERS);
      const dateColumn = findColumn(headers, DATE_HEADERS);
      if (orderColumn < 0 || dateColumn < 0) continue;

      rows.slice(1).forEach((row, index) => {
        const rawOrder = String(row[orderColumn] ?? '');
        const supplierOrderNo = canonicalizeSupplierOrder(rawOrder);
        const value = formatDate(row[dateColumn]);
        const evidence = `${sheetName}!${index + 2}`;
        if (!supplierOrderNo) {
          errors.push({
            code: 'INVALID_ORDER',
            supplierOrderNo: null,
            evidence,
            value: rawOrder,
          });
          return;
        }
        if (!value) {
          errors.push({
            code: 'INVALID_DATE',
            supplierOrderNo,
            evidence,
            value: String(row[dateColumn] ?? ''),
          });
          return;
        }
        results.push({
          supplierOrderNo,
          field:
            fieldColumn >= 0 && String(row[fieldColumn] ?? '').trim()
              ? String(row[fieldColumn]).trim()
              : 'deadline',
          value,
          evidence,
        });
      });
    }
    return { values: results, errors };
  }
}
