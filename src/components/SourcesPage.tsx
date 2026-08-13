import { useStore } from '../lib/store';

export default function SourcesPage() {
  const erpItems = useStore((s) => s.erpItems);

  const sourceCounts = {
    erp: 0,
    email: 0,
    calculation: 0,
    manual: 0,
  };

  const sourceItems = new Set<string>();
  erpItems.forEach((item) => {
    Object.values(item.sources).forEach((src) => {
      if (src.type in sourceCounts) {
        sourceCounts[src.type as keyof typeof sourceCounts]++;
      }
      sourceItems.add(src.type);
    });
  });

  const totalSources = Object.values(sourceCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Источники данных</h1>

      <div className="grid grid-cols-4 gap-4">
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm text-gray-700">ERP-система</span>
            </div>
            <span className="text-xs text-emerald-600 font-medium">Подключено</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm text-gray-700">Электронная почта (IMAP)</span>
            </div>
            <span className="text-xs text-emerald-600 font-medium">Подключено</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-sm text-gray-700">Excel-импорт</span>
            </div>
            <span className="text-xs text-amber-600 font-medium">Требует настройки</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Последние синхронизации</h3>
        <div className="space-y-2 text-xs text-gray-600">
          <div className="flex justify-between">
            <span>ERP-данные</span>
            <span className="text-gray-400">12.08.2026 14:32</span>
          </div>
          <div className="flex justify-between">
            <span>Email-письма</span>
            <span className="text-gray-400">12.08.2026 14:30</span>
          </div>
          <div className="flex justify-between">
            <span>Сопоставление данных</span>
            <span className="text-gray-400">12.08.2026 14:28</span>
          </div>
        </div>
      </div>
    </div>
  );
}