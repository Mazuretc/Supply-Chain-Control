import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('database and seed enforce the singleton administrator slot', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read(
    'prisma/migrations/20260817100000_initial_foundation/migration.sql',
  );
  const seed = read('prisma/seed.ts');

  assert.match(schema, /singletonKey\s+Int\s+@unique\s+@default\(1\)/);
  assert.match(
    migration,
    /CHECK \("singletonKey" = 1\)/,
  );
  assert.match(
    migration,
    /UNIQUE INDEX "AdminUser_singletonKey_key"/,
  );
  assert.match(seed, /where:\s*\{\s*singletonKey:\s*1\s*\}/);
});

test('database permits only one current deadline value per order field', () => {
  const migration = read(
    'prisma/migrations/20260817100000_initial_foundation/migration.sql',
  );

  assert.match(
    migration,
    /CREATE UNIQUE INDEX "DeadlineValue_one_current_per_field"[\s\S]+WHERE "isCurrent" = true;/,
  );
});

test('mail processing retries are idempotent at message and extraction boundaries', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read(
    'prisma/migrations/20260817130000_mail_worker_deadlines/migration.sql',
  );

  assert.match(schema, /lastPolledAt\s+DateTime\?/);
  assert.match(schema, /processedAt\s+DateTime\?/);
  assert.match(schema, /dedupeKey\s+String\s+@unique/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "ExtractionResult_dedupeKey_key"/,
  );
});

test('jobs use PostgreSQL-backed renewable leases and stale recovery indexes', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read(
    'prisma/migrations/20260817140000_mail_review_hardening/migration.sql',
  );

  assert.match(schema, /leaseOwner\s+String\?/);
  assert.match(schema, /leaseExpiresAt\s+DateTime\?/);
  assert.match(schema, /heartbeatAt\s+DateTime\?/);
  assert.match(
    migration,
    /CREATE INDEX "Job_status_availableAt_leaseExpiresAt_idx"/,
  );
});

test('deadline resolver migration retains the PostgreSQL partial unique current-value constraint', () => {
  const foundation = read(
    'prisma/migrations/20260817100000_initial_foundation/migration.sql',
  );
  assert.match(
    foundation,
    /CREATE UNIQUE INDEX "DeadlineValue_one_current_per_field"[\s\S]+WHERE "isCurrent" = true;/,
  );
});
