import { useStore } from '../lib/store';
import { StatusBadge, formatDate, formatDeviation } from './ui';

export default function SupplierOrderDetail() {
  const selectedSupplierOrderId = useStore((s) => s.selectedSupplierOrderId);
  const supplierOrders = useStore((s) => s.supplierOrders);
  const erpItems = useStore((s) => s.erpItems);
  const navigateTo = useStore((s) => s.navigateTo);

  const so = supplierOrders.find((o) => o.id === selectedSupplierOrderId);
  if (!so) return null;

  const items = erpItems.filter((i) => i.supplierOrderId === so.id);

  return (
    <div className="h-full min-h-0 flex-1 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 shrink-0">
        <button
          onClick={() => navigateTo('orders')}
          className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-2"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Назад к списку
        </button>
        <h1 className="text-lg font-semibold font-mono text-gray-800 break-words">Заказ поставщику {so.supplierOrderNumber}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{so.supplier}</p>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
          <StatusBadge status={so.status} />
          <span className="text-xs text-gray-500">Дата создания: {formatDate(so.createdAt)}</span>
          <span className="text-xs text-gray-500">Текущий этап: {so.currentStage}</span>
          {so.deadline && <span className="text-xs text-gray-500">Дедлайн: {formatDate(so.deadline)}</span>}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {/* Основная информация */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Информация о заказе</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-gray-500 w-32 shrink-0">Поставщик</span>
              <span className="text-xs text-gray-800 min-w-0 break-words">{so.supplier}</span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-gray-500 w-32 shrink-0">Дата создания</span>
              <span className="text-xs text-gray-800">{formatDate(so.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-gray-500 w-32 shrink-0">Общий статус</span>
              <StatusBadge status={so.status} />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-gray-500 w-32 shrink-0">План производства</span>
              <span className="text-xs text-gray-800">{formatDate(so.productionPlan)}</span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-gray-500 w-32 shrink-0">Текущий этап</span>
              <span className="text-xs text-gray-800 min-w-0 break-words">{so.currentStage}</span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-gray-500 w-32 shrink-0">Дедлайн</span>
              <span className="text-xs text-gray-800">{formatDate(so.deadline)}</span>
            </div>
          </div>
        </div>

        {/* Связанные ERP-позиции */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Связанные ERP-позиции ({items.length})</h3>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="py-2 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">ERP-код</th>
                <th className="py-2 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Номенклатура</th>
                <th className="py-2 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Статус</th>
                <th className="py-2 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">План производства</th>
                <th className="py-2 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Отклонение</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                  onClick={() => navigateTo('erp-detail', { erpId: item.id })}
                >
                  <td className="py-2 px-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateTo('erp-detail', { erpId: item.id });
                      }}
                      className="font-mono text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      {item.erpCode}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-700 max-w-[240px] truncate" title={item.nomenclature}>{item.nomenclature}</td>
                  <td className="py-2 px-3"><StatusBadge status={item.status} /></td>
                  <td className="py-2 px-3 text-xs text-gray-800">{formatDate(item.production.productionEndPlan)}</td>
                  <td className={`py-2 px-3 text-xs ${item.deadlines.deviation && item.deadlines.deviation > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                    {formatDeviation(item.deadlines.deviation) ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}