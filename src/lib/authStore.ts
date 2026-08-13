import { create } from 'zustand';
import {
  AuthUser,
  clearSession,
  loadSession,
  registerUser,
  saveSession,
  validateCredentials,
} from './auth';

export type AuthMode = 'login' | 'register';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  authMode: AuthMode;
  authError: string | null;
  isLoading: boolean;
  setAuthMode: (mode: AuthMode) => void;
  login: (login: string, password: string) => Promise<boolean>;
  register: (login: string, password: string, confirmPassword: string) => Promise<boolean>;
  logout: () => void;
}

const initialUser = loadSession();

export const useAuthStore = create<AuthState>((set) => ({
  user: initialUser,
  isAuthenticated: !!initialUser,
  authMode: 'login',
  authError: null,
  isLoading: false,

  setAuthMode: (mode) => set({ authMode: mode, authError: null }),

  login: async (login, password) => {
    set({ isLoading: true, authError: null });

    await new Promise((resolve) => setTimeout(resolve, 400));

    if (!login.trim() || !password) {
      set({
        isLoading: false,
        authError: 'Введите логин и пароль',
      });
      return false;
    }

    if (!validateCredentials(login, password)) {
      set({
        isLoading: false,
        authError: 'Неверный логин или пароль',
      });
      return false;
    }

    const user = { login: login.trim() };
    saveSession(user);
    set({
      user,
      isAuthenticated: true,
      isLoading: false,
      authError: null,
    });
    return true;
  },

  register: async (login, password, confirmPassword) => {
    set({ isLoading: true, authError: null });

    await new Promise((resolve) => setTimeout(resolve, 400));

    const result = registerUser({ login, password, confirmPassword });
    if (!result.ok) {
      set({
        isLoading: false,
        authError: result.error,
      });
      return false;
    }

    const user = { login: login.trim() };
    saveSession(user);
    set({
      user,
      isAuthenticated: true,
      authMode: 'login',
      isLoading: false,
      authError: null,
    });
    return true;
  },

  logout: () => {
    clearSession();
    set({
      user: null,
      isAuthenticated: false,
      authMode: 'login',
      authError: null,
      isLoading: false,
    });
  },
}));
