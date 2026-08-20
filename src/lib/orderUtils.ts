import { ErpItem, SupplierOrder } from './types';

export function needsAttention(item: ErpItem): boolean {
  return (
    item.status === 'производство_просрочено' ||
    item.trustLevel === 'conflict' ||
    item.trustLevel === 'needs_review'
  );
}

export function itemMatchesFilter(item: ErpItem, filter: string): boolean {
  switch (filter) {
    case 'attention':
      return needsAttention(item);
    case 'overdue':
      return item.status === 'производство_просрочено';
    case 'no_data':
      return item.missingFields.length > 0;
    case 'waiting_client':
      return item.status === 'ожидаем_клиента';
    case 'in_production':
      return item.status === 'в_производстве';
    case 'ready_to_ship':
      return item.status === 'готово' || item.status === 'ожидает_отгрузки';
    case 'in_delivery':
      return item.status === 'в_доставке';
    case 'delivered':
      return item.status === 'доставлено';
    default:
      return true;
  }
}

export function matchesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query);
}

export function groupErpItems(items: ErpItem[]) {
  const byOrder = new Map<string, ErpItem[]>();
  const unlinked: ErpItem[] = [];

  for (const item of items) {
    if (!item.supplierOrderId) {
      unlinked.push(item);
      continue;
    }
    const list = byOrder.get(item.supplierOrderId);
    if (list) list.push(item);
    else byOrder.set(item.supplierOrderId, [item]);
  }

  return { byOrder, unlinked };
}

export function orderMatchesQuery(so: SupplierOrder, items: ErpItem[], query: string): boolean {
  if (!query) return true;
  return (
    matchesQuery(so.supplierOrderNumber, query) ||
    matchesQuery(so.supplier, query) ||
    (so.client ? matchesQuery(so.client, query) : false) ||
    items.some((item) =>
      matchesQuery(item.erpCode, query) ||
      matchesQuery(item.nomenclature, query) ||
      (item.client ? matchesQuery(item.client, query) : false)
    )
  );
}
