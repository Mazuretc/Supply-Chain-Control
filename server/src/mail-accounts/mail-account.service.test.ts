import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MailAccountService } from './mail-account.service';
import { CredentialEncryptionService } from '../security/credential-encryption.service';

test('persists only AES-GCM encrypted IMAP passwords', async () => {
  let created: Record<string, unknown> | undefined;
  const prisma = {
    mailAccount: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return { id: 'mail-1', ...data };
      },
    },
  };
  const encryption = new CredentialEncryptionService(
    Buffer.alloc(32, 3).toString('base64'),
  );
  const service = new MailAccountService(prisma as never, encryption);

  const result = await service.create({
    name: 'Purchasing',
    host: 'imap.example.test',
    port: 993,
    secure: true,
    username: 'orders@example.test',
    password: 'imap-password',
  });

  assert.equal(Object.values(created!).includes('imap-password'), false);
  assert.equal(result.passwordConfigured, true);
  assert.equal('encryptedPassword' in result, false);
  assert.equal('passwordIv' in result, false);
  assert.equal('passwordAuthTag' in result, false);
});
