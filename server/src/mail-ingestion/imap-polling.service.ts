import { Injectable } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { CredentialEncryptionService } from '../security/credential-encryption.service';
import { MailIngestionService } from './mail-ingestion.service';

export interface PollableMailAccount {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  encryptedPassword: string;
  passwordIv: string;
  passwordAuthTag: string;
}

interface ImapClientLike {
  connect(): Promise<unknown>;
  getMailboxLock(path: string): Promise<{ release(): void }>;
  search(query: object, options: { uid: boolean }): Promise<number[] | false>;
  fetch(
    range: string | number[],
    query: {
      source: { maxLength: number };
      uid: boolean;
      size: boolean;
      internalDate: boolean;
    },
    options: { uid: boolean },
  ): AsyncIterable<{
    uid: number;
    source?: Buffer;
    size?: number;
    internalDate?: Date;
  }>;
  logout(): Promise<unknown>;
}

type ImapClientFactory = (
  options: ConstructorParameters<typeof ImapFlow>[0],
) => ImapClientLike;

@Injectable()
export class ImapPollingService {
  constructor(
    private readonly ingestion: MailIngestionService,
    private readonly encryption: CredentialEncryptionService,
    private readonly createClient: ImapClientFactory = (options) =>
      new ImapFlow(options) as ImapClientLike,
    private readonly maxRawBytes = 25 * 1024 * 1024,
  ) {}

  async pollAccount(
    account: PollableMailAccount,
    since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000),
  ): Promise<{ fetched: number; created: number; duplicates: number }> {
    const password = this.encryption.decrypt({
      ciphertext: account.encryptedPassword,
      iv: account.passwordIv,
      authTag: account.passwordAuthTag,
    });
    const client = this.createClient({
      host: account.host,
      port: account.port,
      secure: account.secure,
      auth: { user: account.username, pass: password },
      logger: false,
      maxLiteralSize: this.maxRawBytes + 1,
    });
    let lock: { release(): void } | undefined;
    let fetched = 0;
    let created = 0;
    let duplicates = 0;
    await client.connect();
    try {
      lock = await client.getMailboxLock('INBOX');
      const uids = await client.search({ since }, { uid: true });
      if (!uids || uids.length === 0) return { fetched, created, duplicates };
      for await (const message of client.fetch(
        uids,
        {
          source: { maxLength: this.maxRawBytes + 1 },
          uid: true,
          size: true,
          internalDate: true,
        },
        { uid: true },
      )) {
        if (!message.source) continue;
        if (
          (message.size !== undefined && message.size > this.maxRawBytes) ||
          message.source.length > this.maxRawBytes
        ) {
          throw new Error('Mail raw message size limit exceeded');
        }
        if (!message.internalDate) {
          throw new Error('IMAP message is missing server-trusted internalDate');
        }
        fetched += 1;
        const parsed = await simpleParser(message.source);
        const result = await this.ingestion.persist({
          mailAccountId: account.id,
          messageId: parsed.messageId,
          raw: message.source,
          subject: parsed.subject,
          sender: parsed.from?.value[0]?.address,
          receivedAt: message.internalDate,
          body: parsed.text ?? (parsed.html || null),
          attachments: parsed.attachments.map((attachment) => ({
            filename: attachment.filename ?? 'attachment',
            contentType: attachment.contentType,
            content: attachment.content,
          })),
        });
        if (result.duplicate) duplicates += 1;
        else created += 1;
      }
      return { fetched, created, duplicates };
    } finally {
      lock?.release();
      await client.logout();
    }
  }
}
