import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CredentialEncryptionService } from './credential-encryption.service';
import { PasswordService } from './password.service';
import {
  buildSessionCookieOptions,
  buildSessionOptions,
} from '../config/session.config';
import { validateEnvironment } from '../config/env.validation';
import { parseTrustProxy } from '../config/proxy.config';

const key = Buffer.alloc(32, 7).toString('base64');
const validEnvironment = {
  DATABASE_URL: 'postgresql://lovarus:strong-db-password@localhost:5432/lovarus',
  SESSION_SECRET: 's'.repeat(32),
  CSRF_SECRET: 'c'.repeat(32),
  IMAP_CREDENTIALS_KEY: key,
  GPT_BASE_URL: 'https://gpt.internal.example/v1',
  GPT_API_KEY: 'test-api-key',
  GPT_MODEL: 'corporate-model',
  EXTRACTION_MIN_CONFIDENCE: '0.75',
  MAIL_POLL_INTERVAL_SECONDS: '60',
  RETENTION_DAYS: '90',
  PORT: '3000',
  SESSION_TTL_SECONDS: '900',
  TRUST_PROXY: 'loopback',
};

test('encrypts IMAP passwords with authenticated random AES-256-GCM ciphertext', () => {
  const encryption = new CredentialEncryptionService(key);

  const first = encryption.encrypt('mail-secret');
  const second = encryption.encrypt('mail-secret');

  assert.equal(encryption.decrypt(first), 'mail-secret');
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.notEqual(first.iv, second.iv);
});

test('rejects tampered IMAP ciphertext', () => {
  const encryption = new CredentialEncryptionService(key);
  const encrypted = encryption.encrypt('mail-secret');
  const tampered = {
    ...encrypted,
    authTag: Buffer.alloc(16, 1).toString('base64'),
  };

  assert.throws(() => encryption.decrypt(tampered));
});

test('requires an exact 32-byte credential key', () => {
  assert.throws(
    () => new CredentialEncryptionService(Buffer.alloc(31).toString('base64')),
    /32 bytes/,
  );
});

test('stores and verifies administrator passwords with Argon2', async () => {
  const passwords = new PasswordService();
  const passwordHash = await passwords.hash('correct horse battery staple');

  assert.match(passwordHash, /^\$argon2/);
  assert.equal(await passwords.verify(passwordHash, 'correct horse battery staple'), true);
  assert.equal(await passwords.verify(passwordHash, 'wrong password'), false);
});

test('builds a time-limited HTTP-only same-site session cookie', () => {
  const options = buildSessionCookieOptions({
    production: true,
    ttlSeconds: 900,
  });

  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, 'strict');
  assert.equal(options.secure, true);
  assert.equal(options.maxAge, 900_000);
});

test('does not persist or roll untouched anonymous sessions', () => {
  const options = buildSessionOptions({
    production: true,
    secret: 's'.repeat(32),
    store: {} as never,
    ttlSeconds: 900,
  });

  assert.equal(options.saveUninitialized, false);
  assert.equal(options.rolling, false);
});

test('rejects weak server secrets during startup validation', () => {
  assert.throws(
    () => validateEnvironment({
      ...validEnvironment,
      SESSION_SECRET: 'short',
    }),
    /SESSION_SECRET/,
  );
});

test('accepts only finite positive integer ports and session TTLs', () => {
  for (const PORT of ['0', '65536', '1.5', 'Infinity', 'NaN']) {
    assert.throws(
      () => validateEnvironment({ ...validEnvironment, PORT }),
      /PORT/,
    );
  }
  for (const SESSION_TTL_SECONDS of ['0', '-1', '1.5', 'Infinity', 'NaN']) {
    assert.throws(
      () => validateEnvironment({ ...validEnvironment, SESSION_TTL_SECONDS }),
      /SESSION_TTL_SECONDS/,
    );
  }
});

test('rejects documented placeholder database and administrator credentials', () => {
  assert.throws(
    () => validateEnvironment({
      ...validEnvironment,
      DATABASE_URL: 'postgresql://lovarus:change-me@localhost:5432/lovarus',
    }),
    /DATABASE_URL/,
  );
  assert.throws(
    () => validateEnvironment({
      ...validEnvironment,
      ADMIN_PASSWORD: 'replace-during-deployment',
    }),
    /ADMIN_PASSWORD/,
  );
  assert.throws(
    () => validateEnvironment({
      ...validEnvironment,
      SESSION_SECRET: 'replace-with-at-least-32-random-characters',
    }),
    /SESSION_SECRET/,
  );
});

test('trusts forwarded client addresses only from a same-host proxy', () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('loopback'), 'loopback');
  assert.throws(() => parseTrustProxy('1'), /TRUST_PROXY/);
  assert.throws(() => parseTrustProxy('true'), /TRUST_PROXY/);
});

test('validates worker intervals, retention and extraction confidence', () => {
  assert.equal(
    validateEnvironment(validEnvironment).EXTRACTION_MIN_CONFIDENCE,
    0.75,
  );
  for (const EXTRACTION_MIN_CONFIDENCE of ['-0.1', '1.1', 'NaN']) {
    assert.throws(
      () => validateEnvironment({ ...validEnvironment, EXTRACTION_MIN_CONFIDENCE }),
      /EXTRACTION_MIN_CONFIDENCE/,
    );
  }
  assert.throws(
    () => validateEnvironment({ ...validEnvironment, GPT_BASE_URL: 'not-a-url' }),
    /GPT_BASE_URL/,
  );
});
