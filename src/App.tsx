import { useStore } from './lib/store';
import { useAuthStore } from './lib/authStore';
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import Filters from './components/Filters';
import OrderTable from './components/OrderTable';
import ErpDetailPanel from './components/ErpDetailPanel';
import SupplierOrderDetail from './components/SupplierOrderDetail';
import AttentionPage from './components/AttentionPage';
import UnlinkedDataPage from './components/UnlinkedDataPage';
import SourcesPage from './components/SourcesPage';

function MainContent() {
  const currentPage = useStore((s) => s.currentPage);

  switch (currentPage) {
    case 'orders':
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-gray-800">Контроль заказов</h1>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-gray-400">Последняя синхр.: 12.08.2026 14:32</span>
              <button className="px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Обновить данные
              </button>
            </div>
          </div>
          <SearchBar />
          <Filters />
          <OrderTable />
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
  const isDetailView = currentPage === 'erp-detail' || currentPage === 'supplier-order-detail';

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 antialiased">
      <Sidebar />
      <main className={`flex-1 overflow-y-auto ${isDetailView ? '' : 'p-6'}`}>
        <MainContent />
      </main>
    </div>
  );
}