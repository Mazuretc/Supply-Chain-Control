import { useStore } from '../lib/store';

const FILTERS = [
  ['all', 'Все'],
  ['attention', 'Требуют внимания'],
  ['overdue', 'Просрочка'],
  ['no_data', 'Нет данных'],
  ['waiting_client', 'Ожидаем ответ клиента'],
  ['in_production', 'В производстве'],
  ['ready_to_ship', 'Готово к отгрузке'],
  ['in_delivery', 'В доставке'],
  ['delivered', 'Доставлено'],
] as const;

export default function Filters() {
  const activeFilter = useStore((s) => s.activeFilter);
  const setActiveFilter = useStore((s) => s.setActiveFilter);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {FILTERS.map(([f, label]) => (
        <button
          key={f}
          onClick={() => setActiveFilter(f)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
            activeFilter === f
              ? 'bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}