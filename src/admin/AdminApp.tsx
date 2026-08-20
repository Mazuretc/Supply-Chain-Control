import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import AuthRoleSwitch from '../components/AuthRoleSwitch';
import BrandMark from '../components/BrandMark';
import BrandName from '../components/BrandName';
import {
  adminApi,
  type AdminIdentity,
  type AuditEvent,
  type CreateMailAccountInput,
  type MailAccount,
  type ProcessingError,
} from '../lib/api';
import { clearAdminSession, loadAdminSession, loginAdmin } from '../lib/adminAuth';

type AdminPage = 'mail-accounts' | 'audit' | 'errors';

const fieldClass =
  'mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 disabled:bg-gray-50';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос';
}

function AdminLogin({ onLogin }: { onLogin: (admin: AdminIdentity) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const admin = loginAdmin(username, password);
      if (!admin) {
        setError('Неверный логин или пароль');
        return;
      }
      onLogin(admin);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <BrandMark className="h-9 w-auto text-[#31356E]" />
            <BrandName className="text-xl leading-none" />
          </div>
          <p className="text-sm text-gray-500">Supply Chain Control</p>
        </div>
        <AuthRoleSwitch value="admin" />
        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">Вход администратора</h1>
            <p className="mt-1 text-xs text-gray-400">Почтовые ящики, аудит и ошибки обработки</p>
          </div>
          {error && <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">{error}</div>}
          <label className="block text-xs font-medium text-gray-600">
            Логин
            <input className={fieldClass} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="admin" />
          </label>
          <label className="block text-xs font-medium text-gray-600">
            Пароль
            <input className={fieldClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          <button disabled={loading} className="w-full rounded-md bg-indigo-600 text-white text-sm font-medium py-2.5 hover:bg-indigo-700 disabled:opacity-60">
            {loading ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}

function PanelState({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string | null;
  children: ReactNode;
}) {
  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Загрузка…</div>;
  if (error) return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-600">{error}</div>;
  return <>{children}</>;
}

function MailAccountsPage() {
  const emptyForm: CreateMailAccountInput = {
    name: '',
    host: '',
    port: 993,
    secure: true,
    username: '',
    password: '',
  };
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await adminApi.listMailAccounts());
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const account = await adminApi.createMailAccount(form);
      setAccounts((current) => [...current, account].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(emptyForm);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const reveal = async (accountId: string) => {
    setError(null);
    try {
      const result = await adminApi.revealMailPassword(accountId, reauth[accountId] ?? '');
      setRevealed((current) => ({ ...current, [accountId]: result.password }));
      setReauth((current) => ({ ...current, [accountId]: '' }));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Почтовые аккаунты</h1>
          <p className="text-xs text-gray-400 mt-1">Список и добавление IMAP-подключений</p>
        </div>
        <button onClick={() => void load()} className="px-3 py-1.5 text-xs rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100">Обновить</button>
      </div>

      <form onSubmit={create} className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Новый аккаунт</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-xs text-gray-600">Название<input required className={fieldClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="text-xs text-gray-600">IMAP-сервер<input required className={fieldClass} value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} /></label>
          <label className="text-xs text-gray-600">Порт<input required className={fieldClass} type="number" min={1} max={65535} value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} /></label>
          <label className="text-xs text-gray-600">Логин<input required className={fieldClass} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" /></label>
          <label className="text-xs text-gray-600">Пароль<input required className={fieldClass} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></label>
          <label className="flex items-center gap-2 text-xs text-gray-600 self-end pb-2">
            <input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} />
            TLS/SSL
          </label>
        </div>
        <button disabled={saving} className="mt-4 px-3 py-2 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving ? 'Сохранение…' : 'Добавить аккаунт'}
        </button>
      </form>

      <PanelState loading={loading} error={error}>
        <div className="space-y-3">
          {accounts.length === 0 && <div className="py-10 text-center text-sm text-gray-400">Почтовые аккаунты не настроены.</div>}
          {accounts.map((account) => (
            <div key={account.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${account.enabled ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                    <h3 className="text-sm font-semibold text-gray-800">{account.name}</h3>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{account.username} · {account.host}:{account.port} · {account.secure ? 'TLS' : 'без TLS'}</p>
                </div>
                <span className="text-[11px] text-gray-400">{account.enabled ? 'Активен' : 'Отключён'}</span>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col sm:flex-row gap-2 sm:items-end">
                <label className="flex-1 text-[11px] text-gray-500">
                  Пароль администратора для раскрытия
                  <input className={fieldClass} type="password" value={reauth[account.id] ?? ''} onChange={(e) => setReauth({ ...reauth, [account.id]: e.target.value })} autoComplete="current-password" />
                </label>
                <button type="button" disabled={!reauth[account.id]} onClick={() => void reveal(account.id)} className="px-3 py-2 text-xs rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                  Показать пароль
                </button>
              </div>
              {revealed[account.id] && (
                <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 font-mono break-all">
                  {revealed[account.id]}
                  <button type="button" onClick={() => setRevealed((current) => ({ ...current, [account.id]: '' }))} className="ml-3 font-sans text-amber-600 hover:underline">Скрыть</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </PanelState>
    </div>
  );
}

function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEvents(await adminApi.listAudit());
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">Журнал аудита</h1>
        <button onClick={() => void load()} className="px-3 py-1.5 text-xs rounded-md bg-indigo-50 text-indigo-600">Обновить</button>
      </div>
      <PanelState loading={loading} error={error}>
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-gray-50 text-gray-500"><tr><th className="p-3 text-left">Время</th><th className="p-3 text-left">Действие</th><th className="p-3 text-left">Объект</th><th className="p-3 text-left">Администратор</th><th className="p-3 text-left">IP</th></tr></thead>
            <tbody>{events.map((event) => <tr key={event.id} className="border-t border-gray-100"><td className="p-3 text-gray-500">{new Date(event.createdAt).toLocaleString('ru-RU')}</td><td className="p-3 font-medium text-gray-800">{event.action}</td><td className="p-3 text-gray-600">{event.entityType}{event.entityId ? ` · ${event.entityId}` : ''}</td><td className="p-3 text-gray-600">{event.actor?.username ?? 'Система'}</td><td className="p-3 text-gray-500">{event.ipAddress ?? '—'}</td></tr>)}</tbody>
          </table>
          {events.length === 0 && <div className="p-10 text-center text-sm text-gray-400">Событий нет.</div>}
        </div>
      </PanelState>
    </div>
  );
}

function ErrorsPage() {
  const [errors, setErrors] = useState<ProcessingError[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setErrors(await adminApi.listProcessingErrors());
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const retry = async (id: string) => {
    setRetrying(id);
    setError(null);
    try {
      await adminApi.retryProcessingError(id);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">Ошибки обработки</h1>
        <button onClick={() => void load()} className="px-3 py-1.5 text-xs rounded-md bg-indigo-50 text-indigo-600">Обновить</button>
      </div>
      <PanelState loading={loading} error={error}>
        <div className="space-y-3">
          {errors.map((item) => (
            <div key={item.id} className={`bg-white border rounded-lg p-4 ${item.resolvedAt ? 'border-gray-200' : 'border-red-200'}`}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0"><div className="text-xs font-semibold text-red-700">{item.code}</div><p className="mt-1 text-sm text-gray-800 break-words">{item.message}</p><p className="mt-1 text-[11px] text-gray-400">{new Date(item.createdAt).toLocaleString('ru-RU')}</p></div>
                {!item.resolvedAt && <button disabled={retrying === item.id} onClick={() => void retry(item.id)} className="px-3 py-1.5 text-xs rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50">{retrying === item.id ? 'Повтор…' : 'Повторить'}</button>}
              </div>
            </div>
          ))}
          {errors.length === 0 && <div className="py-10 text-center text-sm text-gray-400">Ошибок обработки нет.</div>}
        </div>
      </PanelState>
    </div>
  );
}

function pathToPage(): AdminPage {
  if (window.location.pathname.includes('/audit')) return 'audit';
  if (window.location.pathname.includes('/errors')) return 'errors';
  return 'mail-accounts';
}

export default function AdminApp() {
  const [admin, setAdmin] = useState<AdminIdentity | null>(() => loadAdminSession());
  const [page, setPage] = useState<AdminPage>(pathToPage);

  useEffect(() => {
    const onPopState = () => setPage(pathToPage());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (next: AdminPage) => {
    const path = `/admin/${next}`;
    window.history.pushState({}, '', path);
    setPage(next);
  };

  if (!admin) return <AdminLogin onLogin={setAdmin} />;

  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      <header className="bg-[#0f172a] text-white px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BrandMark className="h-7 w-auto text-white" />
          <span className="flex items-center gap-2 min-w-0">
            <BrandName className="text-sm leading-none" tone="white" />
            <span className="text-sm font-semibold text-white/80">· Администрирование</span>
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-white/60">
          <span>{admin.username}</span>
          <a href="/" className="hover:text-white">К заказам</a>
          <button
            onClick={() => {
              clearAdminSession();
              setAdmin(null);
            }}
            className="hover:text-white"
          >
            Выйти
          </button>
        </div>
      </header>
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <nav className="mb-5 flex gap-2 overflow-x-auto">
          {([
            ['mail-accounts', 'Почтовые аккаунты'],
            ['audit', 'Аудит'],
            ['errors', 'Ошибки обработки'],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => navigate(id)} className={`whitespace-nowrap px-3 py-2 rounded-md text-xs font-medium ${page === id ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{label}</button>
          ))}
        </nav>
        {page === 'mail-accounts' ? <MailAccountsPage /> : page === 'audit' ? <AuditPage /> : <ErrorsPage />}
      </div>
    </div>
  );
}
