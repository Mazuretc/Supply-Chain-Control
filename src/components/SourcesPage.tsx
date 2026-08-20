import { useStore } from '../lib/store';

export default function SourcesPage() {
  const erpItems = useStore((s) => s.erpItems);
  const integrations = useStore((s) => s.integrations);

  const sourceCounts = {
    erp: 0,
    email: 0,
    calculation: 0,
    manual: 0,
  };

  for (const item of erpItems) {
    for (const src of Object.values(item.sources)) {
      if (src.type in sourceCounts) {
        sourceCounts[src.type]++;
      }
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Источники данных</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-indigo-600">{sourceCounts.erp}</div>
          <div className="text-xs text-gray-500 mt-1">ERP</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-emerald-600">{sourceCounts.email}</div>
          <div className="text-xs text-gray-500 mt-1">Email</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-sky-600">{sourceCounts.calculation}</div>
          <div className="text-xs text-gray-500 mt-1">Расчёт</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-600">{sourceCounts.manual}</div>
          <div className="text-xs text-gray-500 mt-1">Вручную</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Статус интеграций</h3>
        <div className="space-y-3">
          {integrations.length === 0 ? (
            <div className="text-xs text-gray-400">API не сообщил статусы интеграций.</div>
          ) : integrations.map((integration) => {
            const colors = {
              connected: { dot: 'bg-emerald-500', text: 'text-emerald-600' },
              degraded: { dot: 'bg-amber-500', text: 'text-amber-600' },
              disconnected: { dot: 'bg-red-500', text: 'text-red-600' },
              unknown: { dot: 'bg-gray-500', text: 'text-gray-600' },
            }[integration.status];
            const label = {
              connected: 'Подключено',
              degraded: 'Есть проблемы',
              disconnected: 'Отключено',
              unknown: 'Нет данных',
            }[integration.status];
            return (
              <div key={integration.id} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
                  <span className="text-sm text-gray-700 truncate">{integration.label}</span>
                </div>
                <span
                  className={`text-xs ${colors.text} font-medium shrink-0`}
                  title={integration.message}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Последние синхронизации</h3>
        <div className="space-y-2 text-xs text-gray-600">
          {integrations.filter((item) => item.lastSyncAt).length === 0 ? (
            <div className="text-gray-400">Синхронизации ещё не выполнялись.</div>
          ) : integrations.filter((item) => item.lastSyncAt).map((item) => (
            <div key={item.id} className="flex justify-between gap-4">
              <span>{item.label}</span>
              <span className="text-gray-400">
                {new Intl.DateTimeFormat('ru-RU', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(item.lastSyncAt!))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}