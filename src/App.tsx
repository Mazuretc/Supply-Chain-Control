import { useEffect, useState } from 'react';
import { useStore } from './lib/store';
import { useAuthStore } from './lib/authStore';
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import BrandMark from './components/BrandMark';
import BrandName from './components/BrandName';
import SearchBar from './components/SearchBar';
import Filters from './components/Filters';
import OrderTable from './components/OrderTable';
import ErpDetailPanel from './components/ErpDetailPanel';
import SupplierOrderDetail from './components/SupplierOrderDetail';
import AttentionPage from './components/AttentionPage';
import UnlinkedDataPage from './components/UnlinkedDataPage';
import SourcesPage from './components/SourcesPage';

function formatSyncTime(value: string | null) {
  if (!value) return 'ещё не выполнялась';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date);
}

function MainContent() {
  const currentPage = useStore((s) => s.currentPage);
  const refreshData = useStore((s) => s.refreshData);
  const dataStatus = useStore((s) => s.dataStatus);
  const lastSyncAt = useStore((s) => s.lastSyncAt);

  switch (currentPage) {
    case 'orders':
      return (
        <div className="h-full min-h-0 flex flex-col gap-4">
          <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-lg font-semibold text-gray-800">Контроль заказов</h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-[11px] text-gray-400">Последняя синхр.: {formatSyncTime(lastSyncAt)}</span>
              <button
                type="button"
                onClick={() => void refreshData()}
                disabled={dataStatus === 'loading'}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {dataStatus === 'loading' ? 'Обновление...' : 'Обновить данные'}
              </button>
            </div>
          </div>
          <div className="shrink-0">
            <SearchBar />
          </div>
          <div className="shrink-0">
            <Filters />
          </div>
          <div className="flex-1 min-h-0 min-w-0">
            <OrderTable />
          </div>
        </div>
      );
    case 'attention':
      return <AttentionPage />;
    case 'unlinked':
      return <UnlinkedDataPage />;
    case 'sources':
      return <SourcesPage />;
    case 'erp-detail':
      return <ErpDetailPanel />;
    case 'supplier-order-detail':
      return <SupplierOrderDetail />;
    default:
      return null;
  }
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentPage = useStore((s) => s.currentPage);
  const refreshData = useStore((s) => s.refreshData);
  const dataStatus = useStore((s) => s.dataStatus);
  const dataError = useStore((s) => s.dataError);
  const erpItems = useStore((s) => s.erpItems);
  const lastSyncAt = useStore((s) => s.lastSyncAt);
  const isDetailView = currentPage === 'erp-detail' || currentPage === 'supplier-order-detail';
  const fillViewport = isDetailView || currentPage === 'orders';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-dvh max-h-dvh bg-gray-50 text-gray-900 antialiased overflow-hidden">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Закрыть меню"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        lastSyncLabel={formatSyncTime(lastSyncAt)}
      />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="lg:hidden shrink-0 flex items-center gap-3 px-4 py-3 bg-[#0f172a] text-white">
          <button
            type="button"
            aria-label="Открыть меню"
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 rounded-md bg-white/10 hover:bg-white/15 flex items-center justify-center"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <BrandMark className="h-7 w-auto shrink-0 text-white" />
            <BrandName className="text-sm leading-none truncate" tone="white" />
          </div>
        </header>
        <main className={`flex-1 min-h-0 min-w-0 ${
          isDetailView
            ? 'overflow-hidden flex flex-col'
            : fillViewport
              ? 'overflow-hidden flex flex-col p-4 sm:p-6'
              : 'overflow-y-auto overflow-x-hidden p-4 sm:p-6'
        }`}>
          {dataStatus === 'loading' && erpItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">
              Загрузка данных…
            </div>
          ) : dataStatus === 'error' && erpItems.length === 0 ? (
            <div className="max-w-lg mx-auto mt-16 bg-white border border-red-200 rounded-lg p-5 text-center">
              <h1 className="text-sm font-semibold text-gray-800">Не удалось загрузить данные</h1>
              <p className="mt-2 text-xs text-red-600">{dataError}</p>
              <button
                type="button"
                onClick={() => void refreshData()}
                className="mt-4 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Повторить
              </button>
            </div>
          ) : (
            <div className={fillViewport ? 'flex-1 min-h-0 min-w-0 flex flex-col' : undefined}>
              {dataError && (
                <div className="mb-4 shrink-0 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Обновление не выполнено: {dataError}. Показаны ранее загруженные данные.
                </div>
              )}
              <div className={fillViewport ? 'flex-1 min-h-0 min-w-0 flex flex-col' : undefined}>
                <MainContent />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}