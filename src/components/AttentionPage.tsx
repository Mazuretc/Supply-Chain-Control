import { useStore } from '../lib/store';
import { ErpItem } from '../lib/types';
import { StatusBadge, formatDate, formatDeviation, TrustIndicator } from './ui';

function AttentionCard({ item }: { item: ErpItem }) {
  const navigateTo = useStore((s) => s.navigateTo);
  const so = useStore((s) => s.supplierOrders.find((o) => o.id === item.supplierOrderId));

  const severity = item.status === 'производство_просрочено' ? 'critical' : item.trustLevel === 'conflict' ? 'critical' : 'warning';

  return (
    <div
      className={`bg-white border rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow ${
        severity === 'critical' ? 'border-red-200' : 'border-amber-200'
      }`}
      onClick={() => navigateTo('erp-detail', { erpId: item.id })}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${severity === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
            <span className="font-mono font-semibold text-sm text-indigo-600">{item.erpCode}</span>
            <StatusBadge status={item.status} />
            <TrustIndicator item={item} />
          </div>
          <p className="text-xs text-gray-600 break-words">{item.nomenclature}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-gray-500">
            {so && <span className="break-words">{so.supplierOrderNumber} — {so.supplier}{item.client ? ` · ${item.client}` : ''}</span>}
            {item.deadlines.deviation !== undefined && item.deadlines.deviation !== 0 && (
              <span className={item.deadlines.deviation > 0 ? 'text-red-600 font-medium' : 'text-emerald-600 font-medium'}>
                Отклонение: {formatDeviation(item.deadlines.deviation)}
              </span>
            )}
          </div>
          {item.problems.reason && (
            <p className="text-[11px] text-gray-500 mt-1">
              <span className="text-gray-400">Причина: </span>{item.problems.reason}
            </p>
          )}
          {item.problems.blocker && (
            <p className="text-[11px] text-amber-600 mt-0.5">
              <span className="text-gray-400">Блокер: </span>{item.problems.blocker}
            </p>
          )}
        </div>
        <div className="text-left sm:text-right shrink-0">
          {item.deadlines.deadline && (
            <div className="text-[11px] text-gray-500">
              Дедлайн: <span className="font-medium text-gray-700">{formatDate(item.deadlines.deadline)}</span>
            </div>
          )}
          {item.deadlines.goldDeadline && (
            <div className="text-[11px] text-gray-500 mt-0.5">
              Gold: <span className="font-medium text-gray-700">{formatDate(item.deadlines.goldDeadline)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AttentionPage() {
  const erpItems = useStore((s) => s.erpItems);

  const criticalItems = erpItems.filter(
    (i) => i.status === 'производство_просрочено' || i.trustLevel === 'conflict'
  );
  const warningItems = erpItems.filter(
    (i) => i.trustLevel === 'needs_review' && i.status !== 'производство_просрочено'
  );
  const listedIds = new Set([...criticalItems, ...warningItems].map((i) => i.id));
  const noDataItems = erpItems.filter((i) => i.missingFields.length > 0 && !listedIds.has(i.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold text-gray-800">Требует внимания</h1>
        <span className="text-xs text-gray-500">{criticalItems.length + warningItems.length + noDataItems.length} записей</span>
      </div>

      {/* Critical */}
      {criticalItems.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Критические ({criticalItems.length})
          </h2>
          <div className="space-y-2">
            {criticalItems.map((item) => (
              <AttentionCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Warning */}
      {warningItems.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Требуют проверки ({warningItems.length})
          </h2>
          <div className="space-y-2">
            {warningItems.map((item) => (
              <AttentionCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* No data */}
      {noDataItems.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            Недостающие данные ({noDataItems.length})
          </h2>
          <div className="space-y-2">
            {noDataItems.map((item) => (
              <AttentionCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {criticalItems.length === 0 && warningItems.length === 0 && noDataItems.length === 0 && (
        <div className="text-center py-12 text-sm text-gray-400">
          Все записи в порядке. Нет требующих внимания позиций.
        </div>
      )}
    </div>
  );
}