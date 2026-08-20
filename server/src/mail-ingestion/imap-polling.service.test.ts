import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CredentialEncryptionService } from '../security/credential-encryption.service';
import { ImapPollingService } from './imap-polling.service';

test('polls INBOX under a lock, parses EML and persists each message', async () => {
  const events: string[] = [];
  let fetchQuery: Record<string, unknown> | undefined;
  const internalDate = new Date('2026-08-17T06:30:00Z');
  const raw = Buffer.from(
    [
      'Message-ID: <mail-1@example.test>',
      'Date: Mon, 17 Aug 2026 10:00:00 +0300',
      'From: supplier@example.test',
      'Subject: Deadline',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Order SO-001 deadline 20.09.2026',
    ].join('\r\n'),
  );
  const client = {
    connect: async () => events.push('connect'),
    getMailboxLock: async () => ({
      release: () => events.push('release'),
    }),
    search: async () => [41],
    fetch: async function* (
      _range: unknown,
      query: Record<string, unknown>,
    ) {
      fetchQuery = query;
      yield { uid: 41, source: raw, internalDate, size: raw.length };
    },
    logout: async () => events.push('logout'),
  };
  const persisted: Record<string, unknown>[] = [];
  const ingestion = {
    persist: async (mail: Record<string, unknown>) => {
      persisted.push(mail);
      return { id: 'message-1', duplicate: false };
    },
  };
  const encryption = new CredentialEncryptionService(
    Buffer.alloc(32, 8).toString('base64'),
  );
  const encrypted = encryption.encrypt('imap-password');
  const service = new ImapPollingService(
    ingestion as never,
    encryption,
    () => client as never,
  );

  const result = await service.pollAccount({
    id: 'account-1',
    host: 'imap.example.test',
    port: 993,
    secure: true,
    username: 'orders@example.test',
    encryptedPassword: encrypted.ciphertext,
    passwordIv: encrypted.iv,
    passwordAuthTag: encrypted.authTag,
  });

  assert.deepEqual(events, ['connect', 'release', 'logout']);
  assert.equal(result.fetched, 1);
  assert.equal(persisted[0]?.messageId, '<mail-1@example.test>');
  assert.equal(persisted[0]?.receivedAt, internalDate);
  assert.match(String(persisted[0]?.body), /SO-001/);
  assert.equal(fetchQuery?.internalDate, true);
  assert.equal(fetchQuery?.size, true);
  assert.deepEqual(fetchQuery?.source, { maxLength: 25 * 1024 * 1024 + 1 });
});

test('always releases the mailbox lock and logs out after a fetch failure', async () => {
  const events: string[] = [];
  const encryption = new CredentialEncryptionService(
    Buffer.alloc(32, 2).toString('base64'),
  );
  const encrypted = encryption.encrypt('password');
  const client = {
    connect: async () => undefined,
    getMailboxLock: async () => ({
      release: () => events.push('release'),
    }),
    search: async () => {
      throw new Error('network lost');
    },
    logout: async () => events.push('logout'),
  };
  const service = new ImapPollingService(
    { persist: async () => undefined } as never,
    encryption,
    () => client as never,
  );

  await assert.rejects(
    () =>
      service.pollAccount({
        id: 'account-1',
        host: 'imap.test',
        port: 993,
        secure: true,
        username: 'u',
        encryptedPassword: encrypted.ciphertext,
        passwordIv: encrypted.iv,
        passwordAuthTag: encrypted.authTag,
      }),
    /network lost/,
  );
  assert.deepEqual(events, ['release', 'logout']);
});
