import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApiUrl, createAdminApi, fetchPublicData } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('public API', () => {
  it('builds requests from a configured API base URL', () => {
    expect(buildApiUrl('/orders', 'https://intranet.example/internal-api/'))
      .toBe('https://intranet.example/internal-api/orders');
  });

  it('loads orders and system status without mock fallbacks', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        erpItems: [{ id: 'erp-1' }],
        supplierOrders: [{ id: 'so-1' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        lastSyncAt: '2026-08-17T09:00:00.000Z',
        integrations: [],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchPublicData();

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/orders', expect.objectContaining({
      credentials: 'include',
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/status', expect.objectContaining({
      credentials: 'include',
    }));
    expect(data.lastSyncAt).toBe('2026-08-17T09:00:00.000Z');
    expect(data.erpItems).toEqual([{ id: 'erp-1' }]);
  });

  it('reports a useful API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ message: 'Service unavailable' }), { status: 503 }),
    ));

    await expect(fetchPublicData()).rejects.toThrow('Service unavailable');
  });
});

describe('admin API', () => {
  it('fetches a CSRF token before login and sends cookies', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        admin: { id: 'admin-1', username: 'admin' },
        csrfToken: 'csrf-2',
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = createAdminApi();
    await api.login('admin', 'long-enough-password');

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/admin/auth/login', expect.objectContaining({
      credentials: 'include',
      headers: expect.objectContaining({ 'x-csrf-token': 'csrf-1' }),
    }));
  });

  it('notifies subscribers when an admin operation reports an expired session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }),
    ));
    const api = createAdminApi();
    const onExpired = vi.fn();
    api.onSessionExpired(onExpired);

    await expect(api.listMailAccounts()).rejects.toMatchObject({ status: 401 });

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('invalidates the local admin session even when logout rejects', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Server error' }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const api = createAdminApi();
    const onExpired = vi.fn();
    api.onSessionExpired(onExpired);

    await expect(api.logout()).rejects.toThrow('Server error');

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('uses CSRF protection for retry operations', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const api = createAdminApi();

    await api.retryProcessingError('error/id');

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/admin/processing-errors/error%2Fid/retry',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-csrf-token': 'csrf-1' }),
      }),
    );
  });
});
