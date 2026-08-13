import { PageView } from '../lib/types';
import { useStore } from '../lib/store';
import { useAuthStore } from '../lib/authStore';

const navItems: { id: PageView; label: string; icon: string }[] = [
  { id: 'orders', label: 'Контроль заказов', icon: '📋' },
  { id: 'attention', label: 'Требует внимания', icon: '⚠️' },
  { id: 'unlinked', label: 'Несвязанные данные', icon: '🔗' },
  { id: 'sources', label: 'Источники', icon: '📡' },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const currentPage = useStore((s) => s.currentPage);
  const navigateTo = useStore((s) => s.navigateTo);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const goTo = (id: PageView) => {
    navigateTo(id);
    onClose();
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] bg-[#0f172a] text-white flex flex-col shrink-0 transform transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-56 lg:max-w-none lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="px-5 py-4 border-b border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-md bg-indigo-500 flex items-center justify-center text-xs font-bold shrink-0">L</div>
            <span className="font-semibold text-sm tracking-tight">Lovarus</span>
          </div>
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={onClose}
            className="lg:hidden w-8 h-8 rounded-md text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <span className="text-[10px] text-white/40 mt-1 block">Supply Chain Control</span>
      </div>
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => goTo(item.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left ${
              currentPage === item.id
                ? 'bg-indigo-500/20 text-indigo-200 font-medium'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="px-5 py-3 border-t border-white/10 space-y-2">
        {user && (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] text-white/50 truncate">{user.login}</div>
            </div>
            <button
              onClick={logout}
              className="shrink-0 text-[11px] text-white/40 hover:text-white transition-colors"
            >
              Выйти
            </button>
          </div>
        )}
        <div className="text-[11px] text-white/30">
          <div>v0.1.0 MVP</div>
          <div>Последняя синх.: 12.08.2026 14:32</div>
        </div>
      </div>
    </aside>
  );
}