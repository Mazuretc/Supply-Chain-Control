import { beforeEach, describe, expect, it, vi } from 'vitest';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});

describe('client auth', () => {
  it('accepts the built-in employee credentials', async () => {
    const { validateCredentials } = await import('./auth');
    expect(validateCredentials('admin', 'lovarus')).toBe(true);
    expect(validateCredentials('admin', 'wrong')).toBe(false);
  });

  it('registers a new user and then authenticates that account', async () => {
    const { registerUser, validateCredentials } = await import('./auth');

    expect(registerUser({
      login: 'ivan.petrov',
      password: 'secret1',
      confirmPassword: 'secret1',
    })).toEqual({ ok: true });

    expect(validateCredentials('ivan.petrov', 'secret1')).toBe(true);
  });

  it('rejects a reserved login and mismatched passwords', async () => {
    const { registerUser } = await import('./auth');

    expect(registerUser({
      login: 'admin',
      password: 'secret1',
      confirmPassword: 'secret1',
    })).toEqual({ ok: false, error: 'Этот логин зарезервирован' });

    expect(registerUser({
      login: 'ivan.petrov',
      password: 'secret1',
      confirmPassword: 'other',
    })).toEqual({ ok: false, error: 'Пароли не совпадают' });
  });

  it('persists and clears the browser session', async () => {
    const { saveSession, loadSession, clearSession } = await import('./auth');

    expect(loadSession()).toBeNull();
    saveSession({ login: 'ivan.petrov' });
    expect(loadSession()).toEqual({ login: 'ivan.petrov' });
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
