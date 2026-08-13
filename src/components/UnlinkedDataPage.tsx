import { useState } from 'react';
import { useStore } from '../lib/store';

export default function UnlinkedDataPage() {
  const erpItems = useStore((s) => s.erpItems);
  const supplierOrders = useStore((s) => s.supplierOrders);
  const linkErpToSupplier = useStore((s) => s.linkErpToSupplier);
  const navigateTo = useStore((s) => s.navigateTo);

  const unlinkedItems = erpItems.filter((i) => i.supplierOrderId === null);
  const [selectedOrder, setSelectedOrder] = useState<Record<string, string>>({});

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold text-gray-800">Несвязанные данные</h1>
        <span className="text-xs text-gray-500">{unlinkedItems.length} ERP-позиций без заказа поставщику</span>
      </div>

      {unlinkedItems.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          Все ERP-позиции связаны с заказами поставщикам.
        </div>
      ) : (
        <div className="space-y-3">
          {unlinkedItems.map((item) => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span className="font-mono font-semibold text-sm text-indigo-600">{item.erpCode}</span>
                    <span className="text-xs text-gray-500 break-words">— {item.nomenclature}</span>
                  </div>
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠ Не удалось определить заказ поставщику для {item.erpCode}
                  </p>
                  {item.problems.comment && (
                    <p className="text-[11px] text-gray-500 mt-0.5">{item.problems.comment}</p>
                  )}
                </div>
              </div>

              {/* Link form */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <label className="text-[11px] font-medium text-gray-500 block mb-1.5">
                  Установить связь с заказом поставщику:
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <select
                    value={selectedOrder[item.id] ?? ''}
                    onChange={(e) => setSelectedOrder({ ...selectedOrder, [item.id]: e.target.value })}
                    className="w-full sm:flex-1 min-w-0 text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Выберите заказ поставщику...</option>
                    {supplierOrders.map((so) => (
                      <option key={so.id} value={so.id}>
                        {so.supplierOrderNumber} — {so.supplier}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const soId = selectedOrder[item.id];
                      if (soId) {
                        linkErpToSupplier(item.id, soId);
                        setSelectedOrder({ ...selectedOrder, [item.id]: '' });
                      }
                    }}
                    disabled={!selectedOrder[item.id]}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    Связать
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}