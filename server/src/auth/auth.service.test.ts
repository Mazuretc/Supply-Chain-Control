import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordService } from '../security/password.service';
import { AdminSessionGuard } from './admin-session.guard';
import { AuthController } from './auth.controller';

test('authenticates the single administrator with its Argon2 hash', async () => {
  const passwords = new PasswordService();
  const passwordHash = await passwords.hash('admin-password');
  const prisma = {
    adminUser: {
      findUnique: async () => ({
        id: 'admin-1',
        username: 'admin',
        passwordHash,
      }),
    },
  };
  const auth = new AuthService(prisma as never, passwords);

  assert.deepEqual(await auth.authenticate('admin', 'admin-password'), {
    id: 'admin-1',
    username: 'admin',
  });
});

test('returns the same authentication error for an unknown user and a wrong password', async () => {
  const passwords = new PasswordService();
  const passwordHash = await passwords.hash('admin-password');
  const knownUser = new AuthService({
    adminUser: {
      findUnique: async () => ({
        id: 'admin-1',
        username: 'admin',
        passwordHash,
      }),
    },
  } as never, passwords);
  const unknownUser = new AuthService({
    adminUser: { findUnique: async () => null },
  } as never, passwords);

  await assert.rejects(
    knownUser.authenticate('admin', 'wrong'),
    (error: UnauthorizedException) => error.message === 'Invalid credentials',
  );
  await assert.rejects(
    unknownUser.authenticate('missing', 'wrong'),
    (error: UnauthorizedException) => error.message === 'Invalid credentials',
  );
});

test('admin guard accepts only sessions containing an administrator identity', () => {
  const guard = new AdminSessionGuard();
  const context = (session: object) => ({
    switchToHttp: () => ({
      getRequest: () => ({ session }),
    }),
  });

  assert.equal(
    guard.canActivate(context({ admin: { id: 'admin-1', username: 'admin' } }) as never),
    true,
  );
  assert.throws(
    () => guard.canActivate(context({}) as never),
    UnauthorizedException,
  );
});

test('persists the anonymous session only when issuing a CSRF token', async () => {
  let saves = 0;
  const request = {
    session: {
      save: (callback: (error?: Error) => void) => {
        saves += 1;
        callback();
      },
    },
  };
  const csrf = {
    generateCsrfToken: () => 'csrf-token',
  };
  const controller = new AuthController({} as never, csrf as never);

  assert.deepEqual(
    await controller.csrfToken(request as never, {} as never),
    { csrfToken: 'csrf-token' },
  );
  assert.equal(saves, 1);
});
