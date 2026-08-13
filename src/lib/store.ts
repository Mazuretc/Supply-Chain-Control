import { create } from 'zustand';
import { PageView, ErpItem, SupplierOrder } from './types';
import { supplierOrders as initialOrders, erpItems as initialErpItems } from './mockData';

interface StoreState {
  currentPage: PageView;
  selectedErpId: string | null;
  selectedSupplierOrderId: string | null;
  searchQuery: string;
  activeFilter: string;
  supplierFilter: string;
  statusFilter: string;
  expandedGroups: Set<string>;
  erpItems: ErpItem[];
  supplierOrders: SupplierOrder[];

  navigateTo: (page: PageView, params?: { erpId?: string; supplierOrderId?: string }) => void;
  setSearchQuery: (q: string) => void;
  setActiveFilter: (f: string) => void;
  setSupplierFilter: (f: string) => void;
  setStatusFilter: (f: string) => void;
  toggleGroup: (id: string) => void;
  linkErpToSupplier: (erpId: string, supplierOrderId: string) => void;
  updateErpField: (erpId: string, fieldPath: string, value: any) => void;
  resolveConflict: (erpId: string, field: string, selectedValue: string) => void;
  confirmValue: (erpId: string, field: string) => void;
  unlinkErp: (erpId: string) => void;
}

function setNestedValue(obj: any, path: string, value: any) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

export const useStore = create<StoreState>((set, get) => ({
  currentPage: 'orders',
  selectedErpId: null,
  selectedSupplierOrderId: null,
  searchQuery: '',
  activeFilter: 'all',
  supplierFilter: '',
  statusFilter: '',
  expandedGroups: new Set<string>(['so-001']),
  erpItems: JSON.parse(JSON.stringify(initialErpItems)),
  supplierOrders: JSON.parse(JSON.stringify(initialOrders)),

  navigateTo: (page, params) => {
    set({
      currentPage: page,
      selectedErpId: params?.erpId ?? null,
      selectedSupplierOrderId: params?.supplierOrderId ?? null,
    });
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveFilter: (f) => set({ activeFilter: f }),
  setSupplierFilter: (f) => set({ supplierFilter: f }),
  setStatusFilter: (f) => set({ statusFilter: f }),

  toggleGroup: (id) => {
    const expanded = new Set(get().expandedGroups);
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    set({ expandedGroups: expanded });
  },

  linkErpToSupplier: (erpId, supplierOrderId) => {
    const items = get().erpItems.map((item) =>
      item.id === erpId ? { ...item, supplierOrderId } : item
    );
    // Also update the supplier order's relatedErpIds
    const orders = get().supplierOrders.map((order) => {
      if (order.id === supplierOrderId && !order.relatedErpIds.includes(erpId)) {
        return { ...order, relatedErpIds: [...order.relatedErpIds, erpId] };
      }
      return order;
    });
    set({ erpItems: items, supplierOrders: orders });
  },

  updateErpField: (erpId, fieldPath, value) => {
    const items = get().erpItems.map((item) => {
      if (item.id !== erpId) return item;
      const updated = JSON.parse(JSON.stringify(item));
      setNestedValue(updated, fieldPath, value);
      // Add source for manual edit
      updated.sources[fieldPath] = {
        type: 'manual',
        label: 'Вручную',
        details: 'Изменено пользователем',
      };
      // Remove from missing fields if present
      updated.missingFields = updated.missingFields.filter((f: string) => f !== fieldPath);
      return updated;
    });
    set({ erpItems: items });
  },

  resolveConflict: (erpId, field, selectedValue) => {
    const items = get().erpItems.map((item) => {
      if (item.id !== erpId) return item;
      const updated = JSON.parse(JSON.stringify(item));
      const conflict = updated.conflicts.find((c: any) => c.field === field);
      if (conflict) {
        conflict.selectedValue = selectedValue;
        setNestedValue(updated, field, selectedValue);
        updated.sources[field] = {
          type: 'manual',
          label: 'Вручную',
          details: 'Выбрано пользователем при конфликте',
        };
      }
      // If no more conflicts, update trust level
      if (updated.conflicts.every((c: any) => c.selectedValue)) {
        updated.trustLevel = 'confirmed';
      }
      return updated;
    });
    set({ erpItems: items });
  },

  confirmValue: (erpId, field) => {
    const items = get().erpItems.map((item) => {
      if (item.id !== erpId) return item;
      const updated = JSON.parse(JSON.stringify(item));
      updated.sources[field] = {
        ...updated.sources[field],
        type: 'manual',
        label: 'Подтверждено',
        details: 'Значение подтверждено пользователем',
      };
      updated.trustLevel = 'confirmed';
      return updated;
    });
    set({ erpItems: items });
  },

  unlinkErp: (erpId) => {
    const items = get().erpItems.map((item) =>
      item.id === erpId ? { ...item, supplierOrderId: null } : item
    );
    const orders = get().supplierOrders.map((order) => ({
      ...order,
      relatedErpIds: order.relatedErpIds.filter((id) => id !== erpId),
    }));
    set({ erpItems: items, supplierOrders: orders });
  },
}));