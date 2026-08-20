import { createStore } from 'zustand/vanilla';
import { describe, expect, it } from 'vitest';
import { createStoreState } from './store';
import type { PublicData } from './api';

const loadedData: PublicData = {
  erpItems: [],
  supplierOrders: [],
  lastSyncAt: '2026-08-17T09:00:00.000Z',
  integrations: [],
};

describe('frontend data store', () => {
  it('tracks loading and replaces data from the local source', async () => {
    let resolve!: (data: PublicData) => void;
    const loader = () => new Promise<PublicData>((done) => {
      resolve = done;
    });
    const store = createStore(createStoreState(loader));

    const refresh = store.getState().refreshData();
    expect(store.getState().dataStatus).toBe('loading');

    resolve(loadedData);
    await refresh;

    expect(store.getState()).toMatchObject({
      dataStatus: 'ready',
      dataError: null,
      lastSyncAt: loadedData.lastSyncAt,
    });
  });

  it('keeps existing data visible when manual refresh fails', async () => {
    let shouldFail = false;
    const loader = async () => {
      if (shouldFail) throw new Error('Network offline');
      return loadedData;
    };
    const store = createStore(createStoreState(loader));
    await store.getState().refreshData();

    shouldFail = true;
    await store.getState().refreshData();

    expect(store.getState().dataStatus).toBe('error');
    expect(store.getState().dataError).toBe('Network offline');
    expect(store.getState().lastSyncAt).toBe(loadedData.lastSyncAt);
  });
});
