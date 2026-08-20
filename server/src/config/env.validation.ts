import { parseTrustProxy } from './proxy.config';

export function rejectDocumentedPlaceholder(name: string, value: string): void {
  if (/replace-|change-me|during-deployment/i.test(value)) {
    throw new Error(`${name} contains a documented placeholder value`);
  }
}

export function validateEnvironment(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const required = (name: string): string => {
    const value = input[name];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${name} is required`);
    }
    return value;
  };
  const strongSecret = (name: string): string => {
    const value = required(name);
    rejectDocumentedPlaceholder(name, value);
    if (value.length < 32) {
      throw new Error(`${name} must contain at least 32 characters`);
    }
    return value;
  };
  const positiveInteger = (
    name: string,
    fallback: number,
    maximum = Number.MAX_SAFE_INTEGER,
  ): number => {
    const value = Number(input[name] ?? fallback);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0 || value > maximum) {
      throw new Error(`${name} must be a positive integer no greater than ${maximum}`);
    }
    return value;
  };

  const databaseUrl = required('DATABASE_URL');
  rejectDocumentedPlaceholder('DATABASE_URL', databaseUrl);
  const sessionSecret = strongSecret('SESSION_SECRET');
  const csrfSecret = strongSecret('CSRF_SECRET');
  if (sessionSecret === csrfSecret) {
    throw new Error('CSRF_SECRET must differ from SESSION_SECRET');
  }
  if (typeof input.ADMIN_PASSWORD === 'string') {
    rejectDocumentedPlaceholder('ADMIN_PASSWORD', input.ADMIN_PASSWORD);
  }
  const encryptionKey = Buffer.from(required('IMAP_CREDENTIALS_KEY'), 'base64');
  if (encryptionKey.length !== 32) {
    throw new Error('IMAP_CREDENTIALS_KEY must decode to exactly 32 bytes');
  }
  const port = positiveInteger('PORT', 3000, 65_535);
  const sessionTtlSeconds = positiveInteger('SESSION_TTL_SECONDS', 28_800);
  const gptBaseUrl = required('GPT_BASE_URL');
  try {
    new URL(gptBaseUrl);
  } catch {
    throw new Error('GPT_BASE_URL must be an absolute URL');
  }
  const gptApiKey = required('GPT_API_KEY');
  rejectDocumentedPlaceholder('GPT_API_KEY', gptApiKey);
  required('GPT_MODEL');
  const extractionMinConfidence = Number(input.EXTRACTION_MIN_CONFIDENCE ?? 0.75);
  if (
    !Number.isFinite(extractionMinConfidence) ||
    extractionMinConfidence < 0 ||
    extractionMinConfidence > 1
  ) {
    throw new Error('EXTRACTION_MIN_CONFIDENCE must be between 0 and 1');
  }
  const mailPollIntervalSeconds = positiveInteger(
    'MAIL_POLL_INTERVAL_SECONDS',
    60,
  );
  const retentionDays = positiveInteger('RETENTION_DAYS', 90);
  const trustProxy = parseTrustProxy(input.TRUST_PROXY);

  return {
    ...input,
    PORT: port,
    SESSION_TTL_SECONDS: sessionTtlSeconds,
    EXTRACTION_MIN_CONFIDENCE: extractionMinConfidence,
    MAIL_POLL_INTERVAL_SECONDS: mailPollIntervalSeconds,
    RETENTION_DAYS: retentionDays,
    TRUST_PROXY: trustProxy,
  };
}
