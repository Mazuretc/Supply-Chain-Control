import type { AdminIdentity } from './api';

const SESSION_KEY = 'lovarus_admin_auth';
const ADMIN_LOGIN = 'admin';
const ADMIN_PASSWORD = 'admin';

export function validateAdminCredentials(login: string, password: string): boolean {
  return login.trim().toLowerCase() === ADMIN_LOGIN && password === ADMIN_PASSWORD;
}

export function loadAdminSession(): AdminIdentity | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const admin = JSON.parse(raw) as AdminIdentity;
    return admin?.id && admin?.username ? admin : null;
  } catch {
    return null;
  }
}

export function saveAdminSession(admin: AdminIdentity) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(admin));
}

export function clearAdminSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function loginAdmin(login: string, password: string): AdminIdentity | null {
  if (!validateAdminCredentials(login, password)) return null;
  const admin: AdminIdentity = {
    id: 'local-admin',
    username: ADMIN_LOGIN,
  };
  saveAdminSession(admin);
  return admin;
}
