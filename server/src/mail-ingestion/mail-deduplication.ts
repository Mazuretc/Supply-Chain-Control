import { createHash } from 'node:crypto';

export function normalizeMessageId(messageId: string | undefined | null): string | null {
  const normalized = messageId?.trim().replace(/^<|>$/g, '').toLowerCase();
  return normalized || null;
}

export function contentHash(content: Buffer | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}
