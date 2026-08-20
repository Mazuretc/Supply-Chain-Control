import { useStore } from '../lib/store';
import { ErpItem, SupplierOrder } from '../lib/types';
import { groupErpItems, itemMatchesFilter, matchesQuery, needsAttention, orderMatchesQuery } from '../lib/orderUtils';
import { StatusBadge, formatDate, formatDeviation, MissingData } from './ui';

const headerCell =
  'sticky top-0 z-10 py-2.5 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200 shadow-[inset_0_-1px_0_#e5e7eb]';

function deviationStyle(dev?: number): string {
  if (dev === undefined) return '';
  if (dev > 0) return 'text-red-600 font-medium';
  if (dev < 0) return 'text-emerald-600 font-medium';
  return 'text-gray-400';
}

function ErpRow({ item, order }: { item: ErpItem; order?: SupplierOrder }) {
  const navigateTo = useStore((s) => s.navigateTo);

  return (
    <tr
      className={`hover:bg-gray-50/50 cursor-pointer transition-colors ${
        item.status === 'производство_просрочено' ? 'bg-red-50/30' : ''
      }`}
      onClick={() => navigateTo('erp-detail', { erpId: item.id })}
    >
      <td className="py-2 px-3 text-xs border-b border-gray-100">
        <span className="font-mono font-medium text-indigo-600">{item.erpCode}</span>
      </td>
      <td className="py-2 px-3 text-xs border-b border-gray-100">
        {order ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigateTo('supplier-order-detail', { supplierOrderId: order.id });
            }}
            className="font-mono text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            {order.supplierOrderNumber}
          </button>
        ) : (
          <span className="text-amber-600 text-[11px]">Не связан</span>
        )}
      </td>
      <td className="py-2 px-3 text-xs text-gray-700 max-w-[200px] truncate border-b border-gray-100" title={item.nomenclature}>
        {item.nomenclature}
      </td>
      <td className="py-2 px-3 text-xs text-gray-500 max-w-[140px] truncate border-b border-gray-100" title={order?.supplier}>
        {order?.supplier ?? '—'}
      </td>
      <td className="py-2 px-3 text-xs text-gray-700 max-w-[160px] truncate border-b border-gray-100" title={item.client}>
        {item.client || '—'}
      </td>
      <td className="py-2 px-3 border-b border-gray-100">
        <StatusBadge status={item.status} />
      </td>
      <td className="py-2 px-3 text-xs text-gray-600 border-b border-gray-100">{item.currentStage}</td>
      <td className="py-2 px-3 text-xs text-gray-800 font-medium border-b border-gray-100">
        {item.production.productionEndPlan ? formatDate(item.production.productionEndPlan) : <MissingData />}
      </td>
      <td className="py-2 px-3 text-xs border-b border-gray-100">
        {item.production.readyForShipment ? (
          <span className="text-emerald-600 font-medium">{item.logistics.shipmentDate ? formatDate(item.logistics.shipmentDate) : 'Не указана'}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="py-2 px-3 text-xs border-b border-gray-100">{item.logistics.shipmentDate ? formatDate(item.logistics.shipmentDate) : <span className="text-gray-400">—</span>}</td>
      <td className="py-2 px-3 text-xs border-b border-gray-100">{item.logistics.deliveryDate ? formatDate(item.logistics.deliveryDate) : <span className="text-gray-400">—</span>}</td>
      <td className="py-2 px-3 text-xs font-medium text-gray-800 border-b border-gray-100">
        {item.deadlines.deadline ? formatDate(item.deadlines.deadline) : <span className="text-gray-400">—</span>}
      </td>
      <td className={`py-2 px-3 text-xs border-b border-gray-100 ${deviationStyle(item.deadlines.deviation)}`}>
        {formatDeviation(item.deadlines.deviation) ?? <span className="text-gray-400">—</span>}
      </td>
      <td className="py-2 px-3 text-xs text-gray-500 max-w-[120px] truncate border-b border-gray-100" title={item.problems.reason}>
        {item.problems.reason ?? <span className="text-gray-400">—</span>}
      </td>
    </tr>
  );
}

function SupplierOrderGroup({ so, items }: { so: SupplierOrder; items: ErpItem[] }) {
  const expandedGroups = useStore((s) => s.expandedGroups);
  const toggleGroup = useStore((s) => s.toggleGroup);
  const navigateTo = useStore((s) => s.navigateTo);
  const isExpanded = expandedGroups.has(so.id);

  return (
    <>
      <tr
        className="bg-gray-50/80 hover:bg-gray-100/60 cursor-pointer"
        onClick={() => toggleGroup(so.id)}
      >
        <td className="py-2 px-3 border-b border-gray-200" colSpan={14}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`w-4 h-4 flex items-center justify-center text-gray-400 ${isExpanded ? 'rotate-90' : ''} transition-transform`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigateTo('supplier-order-detail', { supplierOrderId: so.id });
              }}
              className="font-mono font-semibold text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              {so.supplierOrderNumber}
            </button>
            <span className="text-xs text-gray-500 min-w-0 truncate">— {so.supplier}</span>
            {so.client && <span className="text-xs text-gray-600 min-w-0 truncate">· {so.client}</span>}
            <span className="ml-auto flex items-center gap-2 shrink-0">
              <StatusBadge status={so.status} />
              <span className="text-[11px] text-gray-400">{items.length} ERP-поз.</span>
            </span>
          </div>
        </td>
      </tr>
      {isExpanded && items.map((item) => (
        <ErpRow key={item.id} item={item} order={so} />
      ))}
    </>
  );
}

function KPISummary({ items }: { items: ErpItem[] }) {
  const total = items.length;
  const attention = items.filter(needsAttention).length;
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
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-3 sm:gap-x-6 sm:gap-y-2">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="flex items-baseline gap-1.5 min-w-0">
          <span className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</span>
          <span className="text-[11px] text-gray-500">{kpi.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function OrderTable() {
  const searchQuery = useStore((s) => s.searchQuery);
  const activeFilter = useStore((s) => s.activeFilter);
  const supplierOrders = useStore((s) => s.supplierOrders);
  const erpItems = useStore((s) => s.erpItems);
  const query = searchQuery.trim().toLowerCase();
  const { byOrder, unlinked } = groupErpItems(erpItems);

  const filteredOrders = supplierOrders.filter((so) => {
    const items = byOrder.get(so.id) ?? [];
    if (!orderMatchesQuery(so, items, query)) return false;
    return activeFilter === 'all' || items.some((item) => itemMatchesFilter(item, activeFilter));
  });

  const unlinkedItems = unlinked.filter(
    (item) => !query || matchesQuery(item.erpCode, query) || matchesQuery(item.nomenclature, query) || (item.client ? matchesQuery(item.client, query) : false)
  );

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      <div className="shrink-0">
        <KPISummary items={erpItems} />
      </div>

      <div className="flex-1 min-h-0 bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="h-full overflow-auto">
          <table className="w-full min-w-[1540px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${headerCell} w-[110px]`}>ERP-код</th>
                <th className={`${headerCell} w-[140px]`}>Заказ поставщику</th>
                <th className={headerCell}>Номенклатура</th>
                <th className={`${headerCell} w-[140px]`}>Поставщик</th>
                <th className={`${headerCell} w-[160px]`}>Клиент</th>
                <th className={`${headerCell} w-[130px]`}>Статус</th>
                <th className={`${headerCell} w-[130px]`}>Текущий этап</th>
                <th className={`${headerCell} w-[160px]`}>Дата окончания производства (Расчетная)</th>
                <th className={`${headerCell} w-[100px]`}>Готовность к отгр.</th>
                <th className={`${headerCell} w-[140px]`}>Фактическая дата отгрузки</th>
                <th className={`${headerCell} w-[90px]`}>Дата доставки</th>
                <th className={`${headerCell} w-[85px]`}>Дедлайн</th>
                <th className={`${headerCell} w-[70px]`}>Отклонение</th>
                <th className={headerCell}>Причина срыва</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((so) => (
                <SupplierOrderGroup key={so.id} so={so} items={byOrder.get(so.id) ?? []} />
              ))}
              {unlinkedItems.map((item) => (
                <ErpRow key={item.id} item={item} />
              ))}
              {filteredOrders.length === 0 && unlinkedItems.length === 0 && (
                <tr>
                  <td colSpan={14} className="py-8 text-center text-sm text-gray-400">
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
