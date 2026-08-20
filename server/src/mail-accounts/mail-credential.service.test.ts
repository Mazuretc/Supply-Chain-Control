import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { MailCredentialService } from './mail-credential.service';
import { CredentialEncryptionService } from '../security/credential-encryption.service';
import { PasswordService } from '../security/password.service';
import { MailAccountController } from './mail-account.controller';

const key = Buffer.alloc(32, 9).toString('base64');

test('rate limits repeated password reveal attempts', () => {
  const handler = MailAccountController.prototype.revealPassword;

  assert.equal(Reflect.getMetadata('THROTTLER:LIMITdefault', handler), 5);
  assert.equal(Reflect.getMetadata('THROTTLER:TTLdefault', handler), 60_000);
});

test('reveals an IMAP password only after re-authentication and writes an audit event', async () => {
  const passwords = new PasswordService();
  const encryption = new CredentialEncryptionService(key);
  const passwordHash = await passwords.hash('admin-password');
  const encrypted = encryption.encrypt('imap-password');
  const audits: unknown[] = [];
  const prisma = {
    adminUser: {
      findUnique: async () => ({ id: 'admin-1', passwordHash }),
    },
    mailAccount: {
      findUniqueOrThrow: async () => ({
        id: 'mail-1',
        encryptedPassword: encrypted.ciphertext,
        passwordIv: encrypted.iv,
        passwordAuthTag: encrypted.authTag,
      }),
    },
    auditLog: {
      create: async ({ data }: { data: unknown }) => {
        audits.push(data);
        return data;
      },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
  };
  const service = new MailCredentialService(
    prisma as never,
    passwords,
    encryption,
  );

  const revealed = await service.reveal({
    accountId: 'mail-1',
    adminId: 'admin-1',
    password: 'admin-password',
    ipAddress: '10.0.0.8',
  });

  assert.equal(revealed, 'imap-password');
  assert.deepEqual(audits, [{
    actorId: 'admin-1',
    action: 'MAIL_ACCOUNT_PASSWORD_REVEALED',
    entityType: 'MailAccount',
    entityId: 'mail-1',
    ipAddress: '10.0.0.8',
  }]);
});

test('does not decrypt or audit when administrator re-authentication fails', async () => {
  const passwords = new PasswordService();
  const passwordHash = await passwords.hash('admin-password');
  let accountRead = false;
  let auditWritten = false;
  const prisma = {
    adminUser: {
      findUnique: async () => ({ id: 'admin-1', passwordHash }),
    },
    mailAccount: {
      findUniqueOrThrow: async () => {
        accountRead = true;
        return {};
      },
    },
    auditLog: {
      create: async () => {
        auditWritten = true;
      },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
  };
  const service = new MailCredentialService(
    prisma as never,
    passwords,
    new CredentialEncryptionService(key),
  );

  await assert.rejects(
    service.reveal({
      accountId: 'mail-1',
      adminId: 'admin-1',
      password: 'wrong-password',
      ipAddress: '10.0.0.8',
    }),
    UnauthorizedException,
  );
  assert.equal(accountRead, false);
  assert.equal(auditWritten, false);
});
