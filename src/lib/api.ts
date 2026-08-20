import type { ErpItem, SupplierOrder } from './types';

export interface IntegrationStatus {
  id: string;
  label: string;
  status: 'connected' | 'degraded' | 'disconnected' | 'unknown';
  message?: string;
  lastSyncAt?: string | null;
}

export interface PublicData {
  erpItems: ErpItem[];
  supplierOrders: SupplierOrder[];
  lastSyncAt: string | null;
  integrations: IntegrationStatus[];
}

export interface AdminIdentity {
  id: string;
  username: string;
}

export interface MailAccount {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  passwordConfigured?: boolean;
}

export interface CreateMailAccountInput {
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?: { username: string } | null;
}

export interface ProcessingError {
  id: string;
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
  jobId?: string | null;
  messageId?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export function buildApiUrl(path: string, baseUrl = API_BASE_URL) {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  onUnauthorized?: () => void,
): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => null) as
    | { message?: string; error?: string }
    | T
    | null;
  if (!response.ok) {
    if (response.status === 401) {
      onUnauthorized?.();
    }
    const detail = body && typeof body === 'object' && 'message' in body
      ? body.message
      : undefined;
    throw new ApiError(detail || `API request failed (${response.status})`, response.status);
  }
  return body as T;
}

export async function fetchPublicData(): Promise<PublicData> {
  const [orders, status] = await Promise.all([
    request<{ erpItems: ErpItem[]; supplierOrders: SupplierOrder[] }>('/orders'),
    request<{ lastSyncAt: string | null; integrations: IntegrationStatus[] }>('/status'),
  ]);

  if (!Array.isArray(orders.erpItems) || !Array.isArray(orders.supplierOrders)) {
    throw new ApiError('Некорректный ответ API заказов', 500);
  }

  return {
    erpItems: orders.erpItems,
    supplierOrders: orders.supplierOrders,
    lastSyncAt: status.lastSyncAt ?? null,
    integrations: Array.isArray(status.integrations) ? status.integrations : [],
  };
}

export function createAdminApi() {
  let csrfToken: string | null = null;
  let sessionActive = true;
  const sessionExpiredListeners = new Set<() => void>();

  const invalidateSession = () => {
    csrfToken = null;
    if (!sessionActive) return;
    sessionActive = false;
    sessionExpiredListeners.forEach((listener) => listener());
  };

  const adminRequest = <T>(path: string, init: RequestInit = {}) =>
    request<T>(path, init, invalidateSession);

  const getCsrf = async () => {
    const result = await adminRequest<{ csrfToken: string }>('/admin/auth/csrf');
    csrfToken = result.csrfToken;
    return csrfToken;
  };

  const mutate = async <T>(path: string, body?: unknown) => {
    const token = csrfToken ?? await getCsrf();
    return adminRequest<T>(path, {
      method: 'POST',
      headers: { 'x-csrf-token': token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  return {
    onSessionExpired(listener: () => void) {
      sessionExpiredListeners.add(listener);
      return () => sessionExpiredListeners.delete(listener);
    },
    async getSession() {
      const result = await adminRequest<{ admin: AdminIdentity }>('/admin/auth/session');
      sessionActive = true;
      return result;
    },
    async login(username: string, password: string) {
      await getCsrf();
      const result = await mutate<{ admin: AdminIdentity; csrfToken: string }>(
        '/admin/auth/login',
        { username, password },
      );
      csrfToken = result.csrfToken;
      sessionActive = true;
      return result.admin;
    },
    async logout() {
      try {
        await mutate<{ ok: boolean }>('/admin/auth/logout');
      } finally {
        invalidateSession();
      }
    },
    listMailAccounts: () => adminRequest<MailAccount[]>('/admin/mail-accounts'),
    createMailAccount: (input: CreateMailAccountInput) =>
      mutate<MailAccount>('/admin/mail-accounts', input),
    revealMailPassword: (accountId: string, password: string) =>
      mutate<{ password: string }>(
        `/admin/mail-accounts/${encodeURIComponent(accountId)}/reveal-password`,
        { password },
      ),
    listAudit: () => adminRequest<AuditEvent[]>('/admin/audit'),
    listProcessingErrors: () =>
      adminRequest<ProcessingError[]>('/admin/processing-errors'),
    retryProcessingError: (errorId: string) =>
      mutate<{ ok: boolean }>(
        `/admin/processing-errors/${encodeURIComponent(errorId)}/retry`,
      ),
  };
}

export const adminApi = createAdminApi();
