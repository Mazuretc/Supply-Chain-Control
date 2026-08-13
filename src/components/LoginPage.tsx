import { FormEvent, useState } from 'react';
import { useAuthStore } from '../lib/authStore';

function AuthBrand() {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-lg bg-indigo-500 flex items-center justify-center text-sm font-bold text-white">
          L
        </div>
        <span className="font-semibold text-xl text-gray-900 tracking-tight">Lovarus</span>
      </div>
      <p className="text-sm text-gray-500">Supply Chain Control</p>
    </div>
  );
}

export default function LoginPage() {
  const authMode = useAuthStore((s) => s.authMode);
  const setAuthMode = useAuthStore((s) => s.setAuthMode);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const authError = useAuthStore((s) => s.authError);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setConfirmPassword('');
  };

  const switchMode = (mode: 'login' | 'register') => {
    resetForm();
    setAuthMode(mode);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    await register(username, password, confirmPassword);
  };

  const inputClass =
    'mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 disabled:bg-gray-50';

  return (
    <div className="h-full min-h-dvh overflow-y-auto bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm my-auto">
        <AuthBrand />

        {authMode === 'login' ? (
          <form
            onSubmit={handleLogin}
            className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4"
          >
            <div>
              <h1 className="text-lg font-semibold text-gray-800">Вход в систему</h1>
              <p className="text-xs text-gray-400 mt-1">Введите логин и пароль для доступа</p>
            </div>

            {authError && (
              <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                {authError}
              </div>
            )}

            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Логин</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  disabled={isLoading}
                  className={inputClass}
                  placeholder="admin"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">Пароль</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={isLoading}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-md bg-indigo-600 text-white text-sm font-medium py-2.5 hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Вход...' : 'Войти'}
            </button>

            <p className="text-center text-xs text-gray-500">
              Нет аккаунта?{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="text-indigo-600 font-medium hover:text-indigo-700"
              >
                Зарегистрироваться
              </button>
            </p>
          </form>
        ) : (
          <form
            onSubmit={handleRegister}
            className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4"
          >
            <div>
              <h1 className="text-lg font-semibold text-gray-800">Регистрация</h1>
              <p className="text-xs text-gray-400 mt-1">Создайте аккаунт для доступа к системе</p>
            </div>

            {authError && (
              <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                {authError}
              </div>
            )}

            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Логин</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  disabled={isLoading}
                  className={inputClass}
                  placeholder="ivan.petrov"
                />
                <span className="text-[10px] text-gray-400 mt-1 block">
                  Минимум 3 символа: буквы, цифры, точка, _ и -
                </span>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">Пароль</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={isLoading}
                  className={inputClass}
                  placeholder="••••••••"
                />
                <span className="text-[10px] text-gray-400 mt-1 block">Минимум 6 символов</span>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">Подтверждение пароля</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={isLoading}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-md bg-indigo-600 text-white text-sm font-medium py-2.5 hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Регистрация...' : 'Создать аккаунт'}
            </button>

            <p className="text-center text-xs text-gray-500">
              Уже есть аккаунт?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-indigo-600 font-medium hover:text-indigo-700"
              >
                Войти
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
