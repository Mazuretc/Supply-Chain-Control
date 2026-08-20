import { Injectable } from '@nestjs/common';

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface StructuredExtraction {
  supplierOrderNo: string;
  field: string;
  value: string;
  evidence: string;
  confidence: number;
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const extractionSchema = {
  name: 'mail_deadline_extractions',
  strict: true,
  schema: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: [
        'supplierOrderNo',
        'field',
        'value',
        'evidence',
        'confidence',
      ],
      properties: {
        supplierOrderNo: { type: 'string' },
        field: { type: 'string' },
        value: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        evidence: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
  },
} as const;

function parseOutput(value: unknown): StructuredExtraction[] {
  if (!Array.isArray(value)) throw new Error('Structured extraction must be an array');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Structured extraction item ${index} must be an object`);
    }
    const candidate = item as Record<string, unknown>;
    for (const field of [
      'supplierOrderNo',
      'field',
      'value',
      'evidence',
    ] as const) {
      if (typeof candidate[field] !== 'string' || !candidate[field]) {
        throw new Error(`Structured extraction item ${index} has invalid ${field}`);
      }
    }
    if (
      typeof candidate.confidence !== 'number' ||
      candidate.confidence < 0 ||
      candidate.confidence > 1
    ) {
      throw new Error(`Structured extraction item ${index} has invalid confidence`);
    }
    return candidate as unknown as StructuredExtraction;
  });
}

@Injectable()
export class OpenAiCompatibleExtractionService {
  constructor(
    private readonly config: OpenAiCompatibleConfig,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async extract(mailText: string): Promise<StructuredExtraction[]> {
    const endpoint = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const response = await this.fetcher(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'Extract supplier-order deadline facts. Return dates as YYYY-MM-DD and quote the supporting text.',
          },
          { role: 'user', content: mailText },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: extractionSchema,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`Extraction endpoint failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Extraction endpoint returned no message content');
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('Extraction endpoint returned invalid JSON');
    }
    return parseOutput(parsed);
  }
}
