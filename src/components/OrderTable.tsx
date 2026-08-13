import { useState } from 'react';
import { useStore } from '../lib/store';
import { ErpItem, SupplierOrder } from '../lib/types';
import { StatusBadge, formatDate, formatDeviation, SourcePopover, MissingData, TrustIndicator } from './ui';

/* ===== Helpers ===== */
function getSupplierOrder(soId: string | null): SupplierOrder | undefined {
  return useStore.getState().supplierOrders.find((so) => so.id === soId);
}

function getErpItems(soId: string): ErpItem[] {
  return useStore.getState().erpItems.filter((item) => item.supplierOrderId === soId);
}

function getUnlinked(): ErpItem[] {
  return useStore.getState().erpItems.filter((item) => item.supplierOrderId === null);
}

/* ===== Deviation style ===== */
function deviationStyle(dev?: number): string {
  if (dev === undefined || dev === null) return '';
  if (dev > 0) return 'text-red-600 font-medium';
  if (dev < 0) return 'text-emerald-600 font-medium';
  return 'text-gray-400';
}

/* ===== Single ERP row ===== */
function ErpRow({ item, compact }: { item: ErpItem; compact?: boolean }) {
  const navigateTo = useStore((s) => s.navigateTo);
  const so = item.supplierOrderId ? getSupplierOrder(item.supplierOrderId) : null;

  return (
    <tr
      className={`border-b border-gray-100 hover:bg-gray-50/50 cursor-pointer transition-colors ${
        item.status === 'производство_просрочено' ? 'bg-red-50/30' : ''
      }`}
      onClick={() => navigateTo('erp-detail', { erpId: item.id })}
    >
      <td className="py-2 px-3 text-xs">
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigateTo('erp-detail', { erpId: item.id });
          }}
          className="font-mono font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
        >
          {item.erpCode}
        </button>
      </td>
      {!compact && (
        <td className="py-2 px-3 text-xs">
          {so ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateTo('supplier-order-detail', { supplierOrderId: so.id });
              }}
              className="font-mono text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              {so.supplierOrderNumber}
            </button>
          ) : (
            <span className="text-amber-600 text-[11px]">Не связан</span>
          )}
        </td>
      )}
      <td className="py-2 px-3 text-xs text-gray-700 max-w-[200px] truncate" title={item.nomenclature}>
        {item.nomenclature}
      </td>
      {!compact && (
        <td className="py-2 px-3 text-xs text-gray-500 max-w-[140px] truncate" title={so?.supplier}>
          {so?.supplier ?? '—'}
        </td>
      )}
      <td className="py-2 px-3">
        <StatusBadge status={item.status} />
      </td>
      <td className="py-2 px-3 text-xs text-gray-600">{item.currentStage}</td>
      <td className="py-2 px-3 text-xs text-gray-800 font-medium">
        {item.production.productionEndPlan ? formatDate(item.production.productionEndPlan) : <MissingData field="productionEndPlan" />}
      </td>
      <td className="py-2 px-3 text-xs">
        {item.production.readyForShipment ? (
          <span className="text-emerald-600 font-medium">{item.logistics.shipmentDate ? formatDate(item.logistics.shipmentDate) : 'Не указана'}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="py-2 px-3 text-xs">{item.logistics.shipmentDate ? formatDate(item.logistics.shipmentDate) : <span className="text-gray-400">—</span>}</td>
      <td className="py-2 px-3 text-xs">{item.logistics.deliveryDate ? formatDate(item.logistics.deliveryDate) : <span className="text-gray-400">—</span>}</td>
      <td className="py-2 px-3 text-xs font-medium text-gray-800">
        {item.deadlines.deadline ? formatDate(item.deadlines.deadline) : <span className="text-gray-400">—</span>}
      </td>
      <td className={`py-2 px-3 text-xs ${deviationStyle(item.deadlines.deviation)}`}>
        {formatDeviation(item.deadlines.deviation) ?? <span className="text-gray-400">—</span>}
      </td>
      <td className="py-2 px-3 text-xs text-gray-500 max-w-[120px] truncate" title={item.problems.reason}>
        {item.problems.reason ?? <span className="text-gray-400">—</span>}
      </td>
    </tr>
  );
}

/* ===== Supplier order group ===== */
function SupplierOrderGroup({ so }: { so: SupplierOrder }) {
  const expandedGroups = useStore((s) => s.expandedGroups);
  const toggleGroup = useStore((s) => s.toggleGroup);
  const navigateTo = useStore((s) => s.navigateTo);
  const items = getErpItems(so.id);
  const isExpanded = expandedGroups.has(so.id);

  return (
    <>
      {/* Group header */}
      <tr
        className="border-b border-gray-200 bg-gray-50/80 hover:bg-gray-100/60 cursor-pointer"
        onClick={() => toggleGroup(so.id)}
      >
        <td className="py-2 px-3" colSpan={13}>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleGroup(so.id);
              }}
              className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-transform"
            >
              <svg
                className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateTo('supplier-order-detail', { supplierOrderId: so.id });
              }}
              className="font-mono font-semibold text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              {so.supplierOrderNumber}
            </button>
            <span className="text-xs text-gray-500">— {so.supplier}</span>
            <span className="ml-auto flex items-center gap-2">
              <StatusBadge status={so.status} />
              <span className="text-[11px] text-gray-400">{items.length} ERP-поз.</span>
            </span>
          </div>
        </td>
      </tr>
      {/* Group items */}
      {isExpanded && items.map((item) => (
        <ErpRow key={item.id} item={item} />
      ))}
    </>
  );
}

/* ===== KPI summary ===== */
function KPISummary() {
  const items = useStore((s) => s.erpItems);
  const total = items.length;
  const attention = items.filter((i) => i.status === 'производство_просрочено' || i.trustLevel === 'conflict' || i.trustLevel === 'needs_review').length;
  const overdue = items.filter((i) => i.status === 'производство_просрочено').length;
  const ready = items.filter((i) => i.status === 'готово' || i.status === 'ожидает_отгрузки').length;
  const noData = items.filter((i) => i.missingFields.length > 0).length;

  const kpis = [
    { label: 'Активных ERP-позиций', value: total, color: 'text-gray-800' },
    { label: 'Требуют внимания', value: attention, color: 'text-amber-600' },
    { label: 'Просрочено', value: overdue, color: 'text-red-600' },
    { label: 'Готово к отгрузке', value: ready, color: 'text-emerald-600' },
    { label: 'Нет данных', value: noData, color: 'text-gray-500' },
  ];

  return (
    <div className="flex items-center gap-6">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="flex items-baseline gap-1.5">
          <span className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</span>
          <span className="text-[11px] text-gray-500 whitespace-nowrap">{kpi.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ===== Main table ===== */
export default function OrderTable() {
  const searchQuery = useStore((s) => s.searchQuery);
  const activeFilter = useStore((s) => s.activeFilter);
  const supplierOrders = useStore((s) => s.supplierOrders);
  const erpItems = useStore((s) => s.erpItems);
  const navigateTo = useStore((s) => s.navigateTo);

  /* Filter logic */
  const filteredOrders = supplierOrders.filter((so) => {
    const items = getErpItems(so.id);
    const matchesSearch =
      !searchQuery ||
      so.supplierOrderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      so.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      items.some(
        (item) =>
          item.erpCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.nomenclature.toLowerCase().includes(searchQuery.toLowerCase())
      );

    if (!matchesSearch) return false;

    switch (activeFilter) {
      case 'attention':
        return items.some((i) => i.status === 'производство_просрочено' || i.trustLevel === 'conflict' || i.trustLevel === 'needs_review');
      case 'overdue':
        return items.some((i) => i.status === 'производство_просрочено');
      case 'no_data':
        return items.some((i) => i.missingFields.length > 0);
      case 'waiting_client':
        return items.some((i) => i.status === 'ожидаем_клиента');
      case 'in_production':
        return items.some((i) => i.status === 'в_производстве');
      case 'ready_to_ship':
        return items.some((i) => i.status === 'готово' || i.status === 'ожидает_отгрузки');
      case 'in_delivery':
        return items.some((i) => i.status === 'в_доставке');
      case 'delivered':
        return items.some((i) => i.status === 'доставлено');
      default:
        return true;
    }
  });

  const unlinkedItems = erpItems.filter((item) => {
    if (item.supplierOrderId !== null) return false;
    return (
      !searchQuery ||
      item.erpCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.nomenclature.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="space-y-4">
      {/* KPI */}
      <KPISummary />

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-[110px]">ERP-код</th>
                <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-[140px]">Заказ поставщику</th>
                <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Номенклатура</th>
                <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-[140px]">Поставщик</th>
                <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-[130px]">Статус</th>
                <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-[130px]">Текущий этап</th>
                <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-[100px]">План оконч. произв.</th>
                <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-[100px]">Готовность к отгр.</th>
                <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-[90px]">Дата отгрузки</th>
                <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-[90px]">Дата доставки</th>
                <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-[85px]">Дедлайн</th>
                <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-[70px]">Отклонение</th>
                <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Причина срыва</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((so) => (
                <SupplierOrderGroup key={so.id} so={so} />
              ))}
              {/* Unlinked items */}
              {unlinkedItems.map((item) => (
                <ErpRow key={item.id} item={item} />
              ))}
              {filteredOrders.length === 0 && unlinkedItems.length === 0 && (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-sm text-gray-400">
                    Ничего не найдено
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}