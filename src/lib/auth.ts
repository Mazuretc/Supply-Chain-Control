const SESSION_KEY = 'lovarus_auth';
const USERS_KEY = 'lovarus_users';

const DEFAULT_LOGIN = 'admin';
const DEFAULT_PASSWORD = 'lovarus';
const MIN_LOGIN_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 6;

export interface AuthUser {
  login: string;
}

export interface StoredUser {
  login: string;
  password: string;
  createdAt: string;
}

export interface RegisterInput {
  login: string;
  password: string;
  confirmPassword: string;
}

export type RegisterResult =
  | { ok: true }
  | { ok: false; error: string };

function getExpectedCredentials() {
  return {
    login: import.meta.env.VITE_AUTH_LOGIN ?? DEFAULT_LOGIN,
    password: import.meta.env.VITE_AUTH_PASSWORD ?? DEFAULT_PASSWORD,
  };
}

function isReservedLogin(login: string) {
  return login.toLowerCase() === getExpectedCredentials().login.toLowerCase();
}

export function loadRegisteredUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const users = JSON.parse(raw) as StoredUser[];
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
}

function saveRegisteredUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function validateCredentials(login: string, password: string): boolean {
  const trimmedLogin = login.trim();
  const expected = getExpectedCredentials();

  if (trimmedLogin === expected.login && password === expected.password) {
    return true;
  }

  const user = loadRegisteredUsers().find(
    (u) => u.login.toLowerCase() === trimmedLogin.toLowerCase()
  );
  return user?.password === password;
}

export function registerUser(input: RegisterInput): RegisterResult {
  const login = input.login.trim();

  if (!login || !input.password || !input.confirmPassword) {
    return { ok: false, error: 'Заполните все поля' };
  }

  if (login.length < MIN_LOGIN_LENGTH) {
    return { ok: false, error: `Логин должен быть не короче ${MIN_LOGIN_LENGTH} символов` };
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(login)) {
    return { ok: false, error: 'Логин может содержать только буквы, цифры, точку, _ и -' };
  }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов` };
  }

  if (input.password !== input.confirmPassword) {
    return { ok: false, error: 'Пароли не совпадают' };
  }

  if (isReservedLogin(login)) {
    return { ok: false, error: 'Этот логин зарезервирован' };
  }

  const users = loadRegisteredUsers();
  if (users.some((u) => u.login.toLowerCase() === login.toLowerCase())) {
    return { ok: false, error: 'Пользователь с таким логином уже существует' };
  }

  users.push({
    login,
    password: input.password,
    createdAt: new Date().toISOString(),
  });
  saveRegisteredUsers(users);

  return { ok: true };
}

export function loadSession(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as AuthUser;
    return user?.login ? user : null;
  } catch {
    return null;
  }
}

export function saveSession(user: AuthUser) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
