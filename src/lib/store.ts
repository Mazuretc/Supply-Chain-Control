import { create, type StateCreator } from 'zustand';
import type { IntegrationStatus, PublicData } from './api';
import { loadLocalPublicData } from './localData';
import { PageView, ErpItem, SupplierOrder } from './types';

export type DataStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface StoreState {
  currentPage: PageView;
  selectedErpId: string | null;
  selectedSupplierOrderId: string | null;
  searchQuery: string;
  activeFilter: string;
  expandedGroups: Set<string>;
  erpItems: ErpItem[];
  supplierOrders: SupplierOrder[];
  dataStatus: DataStatus;
  dataError: string | null;
  lastSyncAt: string | null;
  integrations: IntegrationStatus[];

  navigateTo: (page: PageView, params?: { erpId?: string; supplierOrderId?: string }) => void;
  setSearchQuery: (q: string) => void;
  setActiveFilter: (f: string) => void;
  toggleGroup: (id: string) => void;
  refreshData: () => Promise<void>;
}

export function createStoreState(
  loadData: () => Promise<PublicData> = loadLocalPublicData,
): StateCreator<StoreState> {
  let refreshVersion = 0;

  return (set, get) => ({
    currentPage: 'orders',
    selectedErpId: null,
    selectedSupplierOrderId: null,
    searchQuery: '',
    activeFilter: 'all',
    expandedGroups: new Set<string>(),
    erpItems: [],
    supplierOrders: [],
    dataStatus: 'idle',
    dataError: null,
    lastSyncAt: null,
    integrations: [],

    navigateTo: (page, params) => {
      set({
        currentPage: page,
        selectedErpId: params?.erpId ?? null,
        selectedSupplierOrderId: params?.supplierOrderId ?? null,
      });
    },

    setSearchQuery: (q) => set({ searchQuery: q }),
    setActiveFilter: (f) => set({ activeFilter: f }),

    toggleGroup: (id) => {
      const expanded = new Set(get().expandedGroups);
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      set({ expandedGroups: expanded });
    },

    refreshData: async () => {
      const version = ++refreshVersion;
      set({ dataStatus: 'loading', dataError: null });
      try {
        const data = await loadData();
        if (version !== refreshVersion) return;
        set({
          erpItems: data.erpItems,
          supplierOrders: data.supplierOrders,
          lastSyncAt: data.lastSyncAt,
          integrations: data.integrations,
          dataStatus: 'ready',
          dataError: null,
        });
      } catch (error) {
        if (version !== refreshVersion) return;
        set({
          dataStatus: 'error',
          dataError: error instanceof Error ? error.message : 'Не удалось загрузить данные',
        });
      }
    },
  });
}

export const useStore = create<StoreState>()(createStoreState());
