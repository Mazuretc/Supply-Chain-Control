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
  vi.stubGlobal('sessionStorage', memoryStorage());
});

describe('local administrator account', () => {
  it('accepts admin / admin and rejects other passwords', async () => {
    const { validateAdminCredentials } = await import('./adminAuth');
    expect(validateAdminCredentials('admin', 'admin')).toBe(true);
    expect(validateAdminCredentials('Admin', 'admin')).toBe(true);
    expect(validateAdminCredentials('admin', 'lovarus')).toBe(false);
    expect(validateAdminCredentials('other', 'admin')).toBe(false);
  });

  it('persists the administrator session after a successful login', async () => {
    const { loginAdmin, loadAdminSession, clearAdminSession } = await import('./adminAuth');

    expect(loadAdminSession()).toBeNull();
    expect(loginAdmin('admin', 'wrong')).toBeNull();
    expect(loginAdmin('admin', 'admin')).toEqual({
      id: 'local-admin',
      username: 'admin',
    });
    expect(loadAdminSession()).toEqual({
      id: 'local-admin',
      username: 'admin',
    });
    clearAdminSession();
    expect(loadAdminSession()).toBeNull();
  });
});
